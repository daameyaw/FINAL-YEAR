import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Timestamp,
} from "firebase/firestore";

import { db, withTimeout } from "@/lib/firebase";

export interface ScanResultRecord {
  id: string;
  timestamp: number;
  level: string;
  term: string;
  score: number;
  correct: number;
  total: number;
  percentage: number;
  grade: string;
  grading: boolean[];
  image: string;
  candidate_number?: string;
  uploadedToCloud?: boolean;
  cloudUploadedAt?: number;
}

export interface CloudScanResult {
  id: string;
  userId: string;
  teacherName: string;
  level: string;
  term: string;
  localId: string;
  candidate_number: string | null;
  score: number;
  correct: number;
  total: number;
  percentage: number;
  grade: string;
  grading: boolean[];
  scannedAt: Date;
  uploadedAt: Date | null;
}

function slug(value: string | null | undefined): string {
  return normalizeExamLabel(value).replace(/\s+/g, "_");
}

export function normalizeExamLabel(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }
  return String(value).trim().replace(/\s+/g, " ");
}

export function labelsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeExamLabel(a);
  const right = normalizeExamLabel(b);
  if (!left || !right) {
    return false;
  }
  return left.toLowerCase() === right.toLowerCase();
}

function unsSlug(value: string): string {
  return normalizeExamLabel(value.replace(/_/g, " "));
}

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as Timestamp).toDate === "function"
  ) {
    return (value as Timestamp).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date(0);
}

function mapResultDoc(
  resultDoc: { id: string; data: () => Record<string, unknown> },
  userId: string,
  levelLabel: string,
  termLabel: string
): CloudScanResult {
  const data = resultDoc.data();

  return {
    id: resultDoc.id,
    userId: String(data.userId ?? userId),
    teacherName: String(data.teacherName ?? "Teacher"),
    level: normalizeExamLabel(String(data.level ?? levelLabel)),
    term: normalizeExamLabel(String(data.term ?? termLabel)),
    localId: String(data.localId ?? resultDoc.id),
    candidate_number:
      data.candidate_number === null || data.candidate_number === undefined
        ? null
        : String(data.candidate_number),
    score: Number(data.score ?? 0),
    correct: Number(data.correct ?? 0),
    total: Number(data.total ?? 0),
    percentage: Number(data.percentage ?? 0),
    grade: String(data.grade ?? "F"),
    grading: Array.isArray(data.grading) ? data.grading : [],
    scannedAt: toDate(data.scannedAt),
    uploadedAt: data.uploadedAt ? toDate(data.uploadedAt) : null,
  };
}

export async function fetchUploadedResults(
  userId: string
): Promise<CloudScanResult[]> {
  const uploaded: CloudScanResult[] = [];

  const levelsSnap = await withTimeout(
    getDocs(collection(db, "teachers", userId, "levels")),
    30000,
    "Timed out loading uploaded results."
  );

  for (const levelDoc of levelsSnap.docs) {
    const levelLabel = unsSlug(levelDoc.id);

    const termsSnap = await getDocs(
      collection(db, "teachers", userId, "levels", levelDoc.id, "terms")
    );

    for (const termDoc of termsSnap.docs) {
      const termData = termDoc.data();
      const termLabel = normalizeExamLabel(
        String(termData.term ?? unsSlug(termDoc.id))
      );
      const resolvedLevel = normalizeExamLabel(
        String(termData.level ?? levelLabel)
      );

      const resultsSnap = await getDocs(
        collection(
          db,
          "teachers",
          userId,
          "levels",
          levelDoc.id,
          "terms",
          termDoc.id,
          "results"
        )
      );

      for (const resultDoc of resultsSnap.docs) {
        uploaded.push(
          mapResultDoc(resultDoc, userId, resolvedLevel, termLabel)
        );
      }
    }
  }

  return uploaded.sort(
    (a, b) =>
      (b.uploadedAt?.getTime() ?? 0) - (a.uploadedAt?.getTime() ?? 0)
  );
}

export async function uploadClassResultsToDatabase(
  user: User,
  level: string,
  term: string,
  results: ScanResultRecord[]
): Promise<{ uploaded: number; alreadyUploaded: number }> {
  const normalizedLevel = normalizeExamLabel(level);
  const normalizedTerm = normalizeExamLabel(term);

  if (!normalizedLevel || !normalizedTerm) {
    throw new Error("Please select a class level and term before uploading.");
  }

  const classResults = results.filter(
    (result) =>
      labelsMatch(result.level, normalizedLevel) &&
      labelsMatch(result.term, normalizedTerm)
  );
  const pending = classResults.filter((result) => !result.uploadedToCloud);
  const alreadyUploaded = classResults.length - pending.length;

  if (pending.length === 0) {
    return { uploaded: 0, alreadyUploaded };
  }

  const userId = user.uid;
  const teacherName = user.displayName || user.email || "Teacher";
  const levelKey = slug(normalizedLevel);
  const termKey = slug(normalizedTerm);

  await setDoc(
    doc(db, "teachers", userId),
    {
      userId,
      teacherName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "teachers", userId, "levels", levelKey),
    {
      level: normalizedLevel,
      userId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "teachers", userId, "levels", levelKey, "terms", termKey),
    {
      level: normalizedLevel,
      term: normalizedTerm,
      teacherName,
      userId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  for (const result of pending) {
    await withTimeout(
      setDoc(
        doc(
          db,
          "teachers",
          userId,
          "levels",
          levelKey,
          "terms",
          termKey,
          "results",
          result.id
        ),
        {
          userId,
          teacherName,
          level: normalizedLevel,
          term: normalizedTerm,
          localId: result.id,
          candidate_number: result.candidate_number || null,
          score: result.score,
          correct: result.correct,
          total: result.total,
          percentage: result.percentage,
          grade: result.grade,
          grading: result.grading,
          scannedAt: new Date(result.timestamp),
          uploadedAt: serverTimestamp(),
        }
      ),
      30000,
      "Failed to save result to database."
    );
  }

  return { uploaded: pending.length, alreadyUploaded };
}
