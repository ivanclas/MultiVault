// ==============================
// Firebase Functions + WebAuthn
// Autenticación con Passkeys (Huella/FaceID) + Firebase Custom Token
// Requisitos:
// - Node.js 18+ en Cloud Functions
// - Firebase Admin SDK
// - @simplewebauthn/server
// - Firestore para almacenar usuarios/credenciales
// ==============================

// -------- package.json (pon esto en functions/package.json) --------
/*
{
  "name": "functions",
  "type": "module",
  "engines": { "node": "18" },
  "main": "index.js",
  "dependencies": {
    "@simplewebauthn/server": "^9.0.0",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "firebase-admin": "^12.5.0",
    "firebase-functions": "^4.8.0"
  }
}
*/

// -------- index.js (pon esto en functions/index.js) --------
import express from 'express';
import cors from 'cors';
import * as admin from 'firebase-admin';
import functions from 'firebase-functions';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

// Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// ===== CONFIGURA TU Relying Party =====
// IMPORTANTE: Estos valores están ajustados a tu GitHub Pages
const rpName = 'MultiVault';
const rpID = 'ivanclas.github.io'; // sin https://, solo host
const origin = 'https://ivanclas.github.io'; // con https y sin trailing slash

// Helpers de Firestore
const usersCol = db.collection('users'); // docId: uid (usaremos email en minúsculas)
const credsCol = db.collection('webauthnCredentials'); // docId: credentialID, campos: uid, publicKey, counter, transports

function toBase64URL(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
function fromBase64URL(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

async function getUserDoc(uid) {
  const ref = usersCol.doc(uid);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : null };
}

async function listUserCredentials(uid) {
  const qs = await credsCol.where('uid', '==', uid).get();
  return qs.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Express app
const app = express();
// CORS estricto al dominio de tu app pública
app.use(cors({ origin: 'https://ivanclas.github.io' }));
app.use(express.json());

// Helpers de Firestore
const usersCol = db.collection('users'); // docId: uid (usaremos email en minúsculas)
const credsCol = db.collection('webauthnCredentials'); // docId: credentialID, campos: uid, publicKey, counter, transports

function toBase64URL(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
function fromBase64URL(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

async function getUserDoc(uid) {
  const ref = usersCol.doc(uid);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : null };
}

async function listUserCredentials(uid) {
  const qs = await credsCol.where('uid', '==', uid).get();
  return qs.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Express app
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// --- REGISTRO: OPTIONS ---
app.post('/api/webauthn/register/options', async (req, res) => {
  try {
    const emailRaw = String(req.body.email || '').trim();
    if (!emailRaw) return res.status(400).json({ error: 'email requerido' });
    const uid = emailRaw.toLowerCase();

    // Asegura que exista usuario en Auth/Firestore (opcionalmente crea en Auth)
    let fbUser;
    try { fbUser = await admin.auth().getUserByEmail(uid); } 
    catch {
      fbUser = await admin.auth().createUser({ uid, email: uid, emailVerified: false });
    }

    const { ref, data } = await getUserDoc(uid);
    if (!data) await ref.set({ uid, email: uid }, { merge: true });

    // Excluir credenciales ya registradas
    const existingCreds = await listUserCredentials(uid);
    const excludeCredentials = existingCreds.map(c => ({
      id: fromBase64URL(c.credentialID),
      type: 'public-key',
      transports: c.transports || undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: uid,
      userName: uid,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    // Guarda challenge temporalmente en el usuario
    await ref.set({ currentChallenge: options.challenge }, { merge: true });

    // Convierte id/ids a base64url seguros para JSON
    const pubOpts = {
      ...options,
      user: { ...options.user, id: fromBase64URL(toBase64URL(Buffer.from(options.user.id))) }, // ya es Buffer, garantizamos tipo
    };
    // Ajusta buffers -> base64url
    pubOpts.challenge = options.challenge; // string ya válido
    if (Array.isArray(pubOpts.excludeCredentials)) {
      pubOpts.excludeCredentials = pubOpts.excludeCredentials.map(c => ({
        ...c,
        id: toBase64URL(c.id),
      }));
    }

    return res.json(pubOpts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

// --- REGISTRO: VERIFY ---
app.post('/api/webauthn/register/verify', async (req, res) => {
  try {
    const { email, attestation } = req.body || {};
    if (!email || !attestation) return res.status(400).json({ error: 'payload inválido' });
    const uid = String(email).toLowerCase();

    const { ref, data } = await getUserDoc(uid);
    if (!data || !data.currentChallenge) return res.status(400).json({ error: 'challenge no encontrado' });

    const verification = await verifyRegistrationResponse({
      response: {
        id: attestation.id,
        rawId: fromBase64URL(attestation.rawId),
        response: {
          clientDataJSON: fromBase64URL(attestation.response.clientDataJSON),
          attestationObject: fromBase64URL(attestation.response.attestationObject),
        },
        type: attestation.type,
      },
      expectedChallenge: data.currentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'verificación fallida' });
    }

    const { credentialPublicKey, credentialID, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Guarda credencial
    const credIDb64 = toBase64URL(credentialID);
    await credsCol.doc(credIDb64).set({
      uid,
      credentialID: credIDb64,
      publicKey: toBase64URL(credentialPublicKey),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: attestation.transports || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await ref.set({ currentChallenge: admin.firestore.FieldValue.delete() }, { merge: true });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

// --- AUTH: OPTIONS ---
app.post('/api/webauthn/auth/options', async (req, res) => {
  try {
    const emailRaw = req.body.email ? String(req.body.email).trim().toLowerCase() : null;

    let allowCredentials = [];
    if (emailRaw) {
      const creds = await listUserCredentials(emailRaw);
      allowCredentials = creds.map(c => ({ id: fromBase64URL(c.credentialID), type: 'public-key', transports: c.transports || undefined }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: allowCredentials.length ? allowCredentials : undefined,
    });

    // Persistir challenge a nivel "sesión" genérica (por simplicidad, lo guardamos en doc usuario si lo conocemos)
    if (emailRaw) {
      await usersCol.doc(emailRaw).set({ currentChallenge: options.challenge }, { merge: true });
    }

    const pubOpts = { ...options };
    pubOpts.challenge = options.challenge; // string
    if (Array.isArray(pubOpts.allowCredentials)) {
      pubOpts.allowCredentials = pubOpts.allowCredentials.map(c => ({ ...c, id: toBase64URL(c.id) }));
    }

    return res.json(pubOpts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

// --- AUTH: VERIFY ---
app.post('/api/webauthn/auth/verify', async (req, res) => {
  try {
    const { email, assertion } = req.body || {};
    const emailRaw = email ? String(email).trim().toLowerCase() : null;

    // Obtén credencial por ID
    if (!assertion || !assertion.id) return res.status(400).json({ error: 'assertion inválida' });
    const credDoc = await credsCol.doc(assertion.id).get();
    if (!credDoc.exists) return res.status(404).json({ error: 'credencial no encontrada' });
    const cred = credDoc.data();

    const uid = cred.uid; // usuario dueño de la credencial
    const { data } = await getUserDoc(uid);

    const expectedChallenge = data?.currentChallenge || undefined; // si no guardaste por email en options, SimpleWebAuthn tolera sin expectedChallenge, pero es recomendable

    const verification = await verifyAuthenticationResponse({
      response: {
        id: assertion.id,
        rawId: fromBase64URL(assertion.rawId),
        response: {
          clientDataJSON: fromBase64URL(assertion.response.clientDataJSON),
          authenticatorData: fromBase64URL(assertion.response.authenticatorData),
          signature: fromBase64URL(assertion.response.signature),
          userHandle: assertion.response.userHandle ? fromBase64URL(assertion.response.userHandle) : undefined,
        },
        type: assertion.type,
      },
      expectedRPID: rpID,
      expectedOrigin: origin,
      expectedChallenge, // puedes omitir si manejas la sesión de otra forma
      authenticator: {
        credentialPublicKey: fromBase64URL(cred.publicKey),
        credentialID: fromBase64URL(cred.credentialID),
        counter: cred.counter || 0,
        transports: cred.transports || undefined,
      },
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return res.status(400).json({ error: 'verificación fallida' });
    }

    // Actualiza el contador
    const { newCounter } = verification.authenticationInfo;
    await credDoc.ref.set({ counter: newCounter }, { merge: true });

    // Limpia challenge
    await usersCol.doc(uid).set({ currentChallenge: admin.firestore.FieldValue.delete() }, { merge: true });

    // Asegura usuario en Auth y crea Custom Token
    let fbUser;
    try { fbUser = await admin.auth().getUser(uid); } catch {
      try { fbUser = await admin.auth().getUserByEmail(uid); } catch {}
    }
    if (!fbUser) {
      fbUser = await admin.auth().createUser({ uid, email: uid, emailVerified: false });
    }

    const firebaseCustomToken = await admin.auth().createCustomToken(fbUser.uid);
    return res.json({ verified: true, firebaseCustomToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
});

// Exporta como Function HTTPS
export const webauthn = functions.https.onRequest(app);

// --------- NOTAS DE DESPLIEGUE ---------
// 1) Coloca este archivo como functions/index.js y el package.json provisto.
// 2) firebase init functions (elige JavaScript, Node 18). Reemplaza los archivos.
// 3) firebase deploy --only functions
// 4) Configura rpID y origin con tu dominio real (debe ser HTTPS). Usa dominios autorizados en Firebase Auth.
// 5) En frontend, configura API_BASE apuntando a la URL de esta Function (región incluida).
