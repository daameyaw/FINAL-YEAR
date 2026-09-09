import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyA1PwJeiENrc1cOUpDPyFd2ZJxhwPcQ7JI",
  authDomain: "mcq-marker-ea35a.firebaseapp.com",
  projectId: "mcq-marker-ea35a",
  storageBucket: "mcq-marker-ea35a.firebasestorage.app",
  messagingSenderId: "927711835969",
  appId: "1:927711835969:web:13959b1ce273d3e0c593c0",
  measurementId: "G-FX72G6Q80B",
};

const app = initializeApp(firebaseConfig);

function initFirebaseAuth() {
  if (Platform.OS === "web") {
    return getAuth(app);
  }

  try {
    // Resolved by Metro to the React Native Firebase Auth build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence } = require("firebase/auth");

    if (typeof getReactNativePersistence === "function") {
      return initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    }
  } catch (error) {
    console.warn("Firebase auth persistence setup failed:", error);
  }

  try {
    return getAuth(app);
  } catch {
    return initializeAuth(app);
  }
}

export const auth = initFirebaseAuth();
export const db = getFirestore(app);

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export { withTimeout };
