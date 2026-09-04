import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { Platform } from 'react-native';

import 'react-native-get-random-values';

export const firebaseConfig = {
  apiKey: "AIzaSyBs2uaRPpWcQ4avA2vA_KC3wMH4cxDHcaY",
  authDomain: "geeta-param-seva-6aa03.firebaseapp.com",
  projectId: "geeta-param-seva-6aa03",
  storageBucket: "geeta-param-seva-6aa03.firebasestorage.app",
  messagingSenderId: "554131573621",
  appId: "1:554131573621:web:d0d471ae8d04c57fee213c",
  measurementId: "G-XHYB1SWR88"
} as const;

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createAuth() {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  try {
    const { getReactNativePersistence } = require('@firebase/auth') as {
      getReactNativePersistence: (
        storage: typeof AsyncStorage
      ) => import('firebase/auth').Persistence;
    };

    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();

export const db = getFirestore(app);

export const functions = getFunctions(app, 'asia-south1');

if (__DEV__ && process.env.EXPO_PUBLIC_USE_FUNCTIONS_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
