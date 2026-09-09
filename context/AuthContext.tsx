import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { auth, db, withTimeout } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_TIMEOUT_MS = 30000;

function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.";
    case "permission-denied":
      return "Could not save profile to database. Check Firestore rules in Firebase Console.";
    default:
      return message || "Something went wrong. Please try again.";
  }
}

async function saveUserProfile(
  uid: string,
  name: string,
  email: string
): Promise<void> {
  try {
    await withTimeout(
      setDoc(doc(db, "users", uid), {
        name,
        email,
        createdAt: serverTimestamp(),
      }),
      AUTH_TIMEOUT_MS,
      "Saving profile timed out. Check Firestore setup in Firebase Console."
    );
  } catch (error) {
    console.warn("User profile save failed (account still created):", error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedName) {
        throw new Error("Please enter your name.");
      }
      if (!trimmedEmail) {
        throw new Error("Please enter your email.");
      }
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      try {
        const credential = await withTimeout(
          createUserWithEmailAndPassword(auth, trimmedEmail, password),
          AUTH_TIMEOUT_MS,
          "Sign up timed out. Check your internet and that Email/Password auth is enabled in Firebase Console."
        );

        await withTimeout(
          updateProfile(credential.user, { displayName: trimmedName }),
          AUTH_TIMEOUT_MS,
          "Account created but profile update timed out. You can still sign in."
        );

        await saveUserProfile(credential.user.uid, trimmedName, trimmedEmail);
      } catch (error) {
        if (error instanceof Error && !("code" in (error as object))) {
          throw error;
        }
        throw new Error(getAuthErrorMessage(error));
      }
    },
    []
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      throw new Error("Please enter your email.");
    }
    if (!password) {
      throw new Error("Please enter your password.");
    }

    try {
      await withTimeout(
        signInWithEmailAndPassword(auth, trimmedEmail, password),
        AUTH_TIMEOUT_MS,
        "Sign in timed out. Check your internet connection and try again."
      );
    } catch (error) {
      if (error instanceof Error && !("code" in (error as object))) {
        throw error;
      }
      throw new Error(getAuthErrorMessage(error));
    }
  }, []);

  const logOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signUp, signIn, logOut }),
    [user, loading, signUp, signIn, logOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
