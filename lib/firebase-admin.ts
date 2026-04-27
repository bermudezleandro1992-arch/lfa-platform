import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore }       from 'firebase-admin/firestore';
import { getAuth, Auth }                 from 'firebase-admin/auth';

function getAdminApp() {
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

/* Lazy proxies — se inicializan solo en runtime (request), no en build time */
function lazyProxy<T extends object>(factory: () => T): T {
  let instance: T | null = null;
  return new Proxy({} as T, {
    get(_, prop) {
      if (!instance) instance = factory();
      return Reflect.get(instance as T, prop as keyof T);
    },
  });
}

export const adminDb   = lazyProxy<Firestore>(() => getFirestore(getAdminApp()));
export const adminAuth = lazyProxy<Auth>(() => getAuth(getAdminApp()));
