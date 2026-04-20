import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore }                       from 'firebase-admin/firestore';
import { getAuth }                            from 'firebase-admin/auth';

function initAdmin(): App {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId:    process.env.FIREBASE_ADMIN_PROJECT_ID    ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // La clave privada viene con \n literales desde las variables de entorno
      privateKey:   process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const adminApp = initAdmin();
export const adminDb   = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
