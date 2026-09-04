import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { navigateToSignIn } from '@/lib/auth-navigation';
import { auth, db } from '@/lib/firebase';
import { disableDeviceTokenOnSignOut } from '@/lib/push-signout';
import { clearSessionState, getStableDeviceId } from '@/lib/session';
import { getUserProfile, type UserProfile } from '@/lib/users';

interface AuthContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const signingOutRef = useRef(false);
  const deviceIdRef = useRef<string | null>(null);

  const signOutUser = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setLoading(true);
    try {
      await disableDeviceTokenOnSignOut();
      await clearSessionState();
      await signOut(auth);
      navigateToSignIn();
    } finally {
      setLoading(false);
      signingOutRef.current = false;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await getUserProfile(nextUser.uid);
        setProfile(nextProfile);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Sole-session enforcement: if this device is no longer active, force sign-out.
  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) return;

    let unsubscribeSession: (() => void) | undefined;
    let cancelled = false;

    const attach = async () => {
      const deviceId = deviceIdRef.current ?? (await getStableDeviceId());
      deviceIdRef.current = deviceId;
      if (cancelled) return;

      const sessionRef = doc(db, 'users', uid, 'sessions', deviceId);
      unsubscribeSession = onSnapshot(
        sessionRef,
        (snap) => {
          if (!snap.exists()) {
            // Session doc may lag briefly after login; also check profile activeSessionId.
            if (profile?.activeSessionId && profile.activeSessionId !== deviceId) {
              void signOutUser();
            }
            return;
          }
          const data = snap.data();
          if (data?.active !== true) {
            void signOutUser();
          }
        },
        () => {
          // Ignore transient listener errors; foreground re-check covers soft failures.
        }
      );
    };

    void attach();

    return () => {
      cancelled = true;
      unsubscribeSession?.();
    };
  }, [profile?.uid, profile?.activeSessionId, signOutUser]);

  // Re-check session when app returns to foreground.
  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) return;

    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void (async () => {
        try {
          const deviceId = deviceIdRef.current ?? (await getStableDeviceId());
          deviceIdRef.current = deviceId;
          const next = await getUserProfile(uid);
          if (!next) {
            await signOutUser();
            return;
          }
          setProfile(next);
          if (next.activeSessionId && next.activeSessionId !== deviceId) {
            await signOutUser();
          }
        } catch {
          // Keep current session; next auth/session snapshot will reconcile.
        }
      })();
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [profile?.uid, signOutUser]);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return null;
    }

    const nextProfile = await getUserProfile(auth.currentUser.uid);
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const value = useMemo(
    () => ({
      profile,
      loading,
      refreshProfile,
      signOutUser,
    }),
    [loading, profile, refreshProfile, signOutUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
