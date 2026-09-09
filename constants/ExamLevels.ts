export const EXAM_LEVELS = [
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "JHS 1",
  "JHS 2",
  "JHS 3",
  "SHS 1",
  "SHS 2",
  "SHS 3",
] as const;

export const EXAM_TERMS = ["Term 1", "Term 2", "Term 3"] as const;

export type ExamLevel = (typeof EXAM_LEVELS)[number];
export type ExamTerm = (typeof EXAM_TERMS)[number];
