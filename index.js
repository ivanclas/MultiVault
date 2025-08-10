// index.js
const express = require('express');
const bodyParser = require('body-parser');
const { Fido2Lib } = require('fido2-lib');
const admin = require('firebase-admin');
const cors = require('cors');

// Inicializa firebase-admin con tu serviceAccountKey.json
// Descarga el JSON desde Firebase Console (Service Accounts)
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json({ limit: '1mb' }));

// Configura FIDO2
const f2l = new Fido2Lib({
  timeout: 60000,
  rpId: "tu-dominio.com", // si usas localhost para pruebas, usa "localhost"
  rpName: "Mi App",
  challengeSize: 32,
  cryptoParams: [-7, -257], // ES256, RS256
  authenticatorAttachment: "platform",
  authenticatorRequireResidentKey: false,
  authenticatorUserVerification: "required"
});

// Almacena temporalmente challenges por sesión (para pruebas simples usar map en memoria)
const challengeStore = new Map(); // <challenge, { email, uid }>

// ---------- Generar opciones de registro ----------
app.post('/generate-registration-options', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    // Si usas login con Firebase, aquí deberías obtener uid del usuario autenticado
    // Para simplificar, asumimos que el frontend ya hizo signIn y envía email,
    // y que el uid se obtiene consultando Firestore users collection:
    // (opcional) intentar obtener uid por email
    let uid = null;
    // Buscamos usuario por email (opcional)
    const usersQuery = await db.collection('users').where('email','==',email).limit(1).get();
    if (!usersQuery.empty) {
      uid = usersQuery.docs[0].id;
    } else {
      // No existe: creamos un documento temporal con email y generamos uid random
      const newDoc = db.collection('users').doc();
      await newDoc.set({ email, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      uid = newDoc.id;
    }

    const user = {
      id: Buffer.from(uid).toString('base64'), // user.id must be ArrayBuffer on client; we send base64
      name: email,
      displayName: email
    };

    const registrationOptions = await f2l.attestationOptions();
    registrationOptions.user = user;
    registrationOptions.challenge = bufferToBase64Url(registrationOptions.challenge);
    registrationOptions.user.id = bufferToBase64Url(Buffer.from(uid)); // match client encoding
    // store challenge -> uid/email
    challengeStore.set(registrationOptions.challenge, { email, uid });

    return res.json({ publicKey: registrationOptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Verificar registro (attestation) ----------
app.post('/verify-registration', async (req, res) => {
  try {
    const { email, attestation } = req.body;
    if (!email || !attestation) return res.status(400).json({ error: 'Faltan campos' });

    // convertimos raw fields a Buffer
    const clientAttestationResponse = {
      id: attestation.id,
      rawId: base64urlToBuffer(attestation.rawId),
      response: {
        clientDataJSON: base64urlToBuffer(attestation.response.clientDataJSON),
        attestationObject: base64urlToBuffer(attestation.response.attestationObject)
      },
      type: attestation.type
    };

    // Recuperar challenge asociado (en pruebas lo guardamos en memoria)
    // El client envió challenge en create step, el servidor lo creó en generate-reg.
    // Para simplificar, buscamos cualquier challenge asociado al email (básico)
    let storedChallengeEntry = null;
    for (let [challenge, info] of challengeStore.entries()) {
      if (info.email === email) { storedChallengeEntry = { challenge, info }; break; }
    }
    if (!storedChallengeEntry) return res.status(400).json({ error: 'Challenge no encontrado' });

    // prepare expected
    const expected = {
      challenge: base64urlToBuffer(storedChallengeEntry.challenge),
      origin: "https://TU_DOMINIO", // ajustar según deployment
      factor: "either"
    };

    // verify attestation
    const regResult = await f2l.attestationResult(clientAttestationResponse, expected);

    // regResult contains publicKey, counter, fmt, etc.
    const rawIdB64Url = bufferToBase64Url(regResult.authnrData.get('rawId') || regResult.get('rawId') || clientAttestationResponse.rawId);

    // store credential in Firestore under user (by uid)
    const uid = storedChallengeEntry.info.uid;
    const credDocRef = db.collection('webauthnCredentials').doc(rawIdB64Url);
    await credDocRef.set({
      uid,
      email,
      publicKey: regResult.authnrData.get('credentialPublicKeyPem') || regResult.get('credentialPublicKey'),
      fmt: regResult.fmt,
      counter: regResult.authnrData.get('counter') || 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // remove challenge
    challengeStore.delete(storedChallengeEntry.challenge);

    return res.json({ success: true, id: rawIdB64Url });
  } catch (err) {
    console.error('verify-registration err', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

// ---------- Generar opciones de autenticación (assertion) ----------
app.post('/generate-authentication-options', async (req, res) => {
  try {
    // obtenemos credenciales registradas y mandamos allowCredentials
    const credsSnap = await db.collection('webauthnCredentials').limit(50).get(); // limita por seguridad
    const allowCredentials = [];
    credsSnap.forEach(docSnap => {
      const id = docSnap.id; // ya es base64url
      allowCredentials.push({ id, type: 'public-key', transports: ['internal'] });
    });

    const authnOptions = await f2l.assertionOptions();
    authnOptions.challenge = bufferToBase64Url(authnOptions.challenge);
    if (allowCredentials.length) {
      authnOptions.allowCredentials = allowCredentials;
    }
    // guardamos challenge temporalmente
    challengeStore.set(authnOptions.challenge, { timestamp: Date.now() });

    return res.json({ publicKey: authnOptions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Verificar autenticación (assertion) ----------
app.post('/verify-authentication', async (req, res) => {
  try {
    const { authData } = req.body;
    if (!authData) return res.status(400).json({ success:false, error:'No authData' });

    const clientAssertion = {
      id: authData.id,
      rawId: base64urlToBuffer(authData.rawId),
      response: {
        clientDataJSON: base64urlToBuffer(authData.response.clientDataJSON),
        authenticatorData: base64urlToBuffer(authData.response.authenticatorData),
        signature: base64urlToBuffer(authData.response.signature),
        userHandle: authData.response.userHandle ? base64urlToBuffer(authData.response.userHandle) : null
      },
      type: authData.type
    };

    // Recuperar challenge (simplificado: tomamos el último)
    let storedChallenge = null;
    for (let [challenge, v] of challengeStore.entries()) { storedChallenge = challenge; break; }
    if (!storedChallenge) return res.status(400).json({ success:false, error:'No challenge saved' });

    const expected = {
      challenge: base64urlToBuffer(storedChallenge),
      origin: "https://TU_DOMINIO",
      factor: "either"
    };

    // find the credential in Firestore using rawId base64url (client sent rawId from navigator)
    const rawIdB64Url = authData.rawId; // client already provided base64url
    const credSnap = await db.collection('webauthnCredentials').doc(rawIdB64Url).get();
    if (!credSnap.exists) {
      return res.status(400).json({ success:false, error:'Credencial no encontrada' });
    }
    const cred = credSnap.data();

    // Build publicKey for verification
    const verification = await f2l.assertionResult(clientAssertion, {
      challenge: base64urlToBuffer(storedChallenge),
      origin: "https://TU_DOMINIO",
      factor: "either",
      publicKey: cred.publicKey,
      prevCounter: cred.counter || 0,
      userHandle: null
    });

    // If verification ok, update counter in DB
    await db.collection('webauthnCredentials').doc(rawIdB64Url).update({
      counter: verification.authnrData.get('counter') || verification.get('authnrData')?.counter || cred.counter || 0
    });

    // Now we have uid from cred
    const uid = cred.uid;
    // create firebase custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // remove challenge
    challengeStore.delete(storedChallenge);

    return res.json({ success:true, customToken });
  } catch (err) {
    console.error('verify-auth err', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

// helpers for base64url <-> buffer (server side)
function bufferToBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64urlToBuffer(base64url) {
  base64url = base64url.replace(/-/g,'+').replace(/_/g,'/');
  while (base64url.length % 4) base64url += '=';
  return Buffer.from(base64url, 'base64');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on", PORT));
module.exports = app;
