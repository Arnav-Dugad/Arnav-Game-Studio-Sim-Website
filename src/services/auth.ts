/** Auth session store: Firebase users, or a local guest profile when offline / not configured. */
import { create } from 'zustand';
import { firebaseConfigured, getFirebase } from './firebase';

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  guest: boolean;
  provider: 'password' | 'google' | 'guest';
  emailVerified: boolean;
}

interface AuthStore {
  user: SessionUser | null;
  ready: boolean;
  init: () => void;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  playAsGuest: () => void;
  signOut: () => Promise<void>;
}

const GUEST_KEY = 'ase:guest';

function guestUser(): SessionUser {
  let id = 'guest';
  try {
    id = localStorage.getItem(GUEST_KEY) ?? `guest-${Date.now().toString(36)}`;
    localStorage.setItem(GUEST_KEY, id);
  } catch {
    /* ignore */
  }
  return { uid: id, email: null, displayName: 'Guest', guest: true, provider: 'guest', emailVerified: false };
}

let initStarted = false;

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  ready: false,
  init: () => {
    if (initStarted) return;
    initStarted = true;
    let guestActive = false;
    try {
      guestActive = sessionStorage.getItem('ase:guestActive') === '1';
    } catch {
      /* ignore */
    }
    if (!firebaseConfigured) {
      set({ ready: true, user: guestActive ? guestUser() : null });
      return;
    }
    getFirebase()
      .then(async ({ auth }) => {
        const { onAuthStateChanged } = await import('firebase/auth');
        onAuthStateChanged(auth, (u) => {
          if (u) {
            try {
              sessionStorage.removeItem('ase:guestActive'); // signed in now: signing out later shouldn't revert to guest
            } catch {
              /* ignore */
            }
            set({
              ready: true,
              user: {
                uid: u.uid,
                email: u.email,
                displayName: u.displayName,
                guest: false,
                provider: u.providerData.some((p) => p.providerId === 'google.com') ? 'google' : 'password',
                emailVerified: u.emailVerified,
              },
            });
          } else {
            let guest = false;
            try {
              guest = sessionStorage.getItem('ase:guestActive') === '1';
            } catch {
              /* ignore */
            }
            set({ ready: true, user: guest ? guestUser() : null });
          }
        });
      })
      .catch(() => set({ ready: true, user: guestActive ? guestUser() : null }));
  },
  signUp: async (email, password, name) => {
    const { auth } = await getFirebase();
    const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth');
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) await updateProfile(cred.user, { displayName: name.trim().slice(0, 40) });
    sendEmailVerification(cred.user).catch(() => undefined);
    set((st) => (st.user ? { user: { ...st.user, displayName: name.trim() || st.user.displayName } } : st));
  },
  signIn: async (email, password) => {
    const { auth } = await getFirebase();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email.trim(), password);
  },
  signInGoogle: async () => {
    const { auth } = await getFirebase();
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  },
  resetPassword: async (email) => {
    const { auth } = await getFirebase();
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(auth, email.trim());
  },
  playAsGuest: () => {
    try {
      sessionStorage.setItem('ase:guestActive', '1');
    } catch {
      /* ignore */
    }
    set({ user: guestUser(), ready: true });
  },
  signOut: async () => {
    try {
      sessionStorage.removeItem('ase:guestActive');
    } catch {
      /* ignore */
    }
    if (firebaseConfigured) {
      const { auth } = await getFirebase();
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    }
    set({ user: null });
  },
}));
