/** Firebase initialisation (lazy-loaded so the landing page stays light). */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const useEmulators = env.VITE_USE_EMULATORS === 'true';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let handles: Promise<FirebaseHandles> | null = null;

export function getFirebase(): Promise<FirebaseHandles> {
  if (!firebaseConfigured) return Promise.reject(new Error('Firebase is not configured'));
  handles ??= (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const existing = appMod.getApps()[0];
    const app = existing ?? appMod.initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
    // initializeAuth lets us choose persistence up-front; the emulator must be connected before any auth call.
    let auth: Auth;
    if (existing) auth = authMod.getAuth(app);
    else {
      auth = authMod.initializeAuth(app, {
        persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
        popupRedirectResolver: authMod.browserPopupRedirectResolver,
      });
      if (useEmulators) authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    }
    const db = fsMod.getFirestore(app);
    if (useEmulators && !existing) fsMod.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return { app, auth, db };
  })();
  return handles;
}

/** Human-friendly messages for Firebase auth error codes. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-email': 'Please enter your email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password. Try again or reset it.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-login-credentials': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
    'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
    'auth/missing-password': 'Please enter a password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled yet. Try another method, or play as a guest.',
    'auth/configuration-not-found': 'Sign-in isn’t set up for this site yet. You can play as a guest meanwhile.',
    'auth/unauthorized-domain': 'This domain isn’t authorised for sign-in yet. You can play as a guest meanwhile.',
    'auth/account-exists-with-different-credential': 'This email is linked to a different sign-in method.',
  };
  return map[code] ?? (err instanceof Error ? err.message.replace(/^Firebase: /, '') : 'Something went wrong. Please try again.');
}
