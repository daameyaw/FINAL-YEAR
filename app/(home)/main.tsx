/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, type Href } from "expo-router";
import { AppTheme } from "@/constants/Colors";
import {
  EXAM_LEVELS,
  EXAM_TERMS,
  type ExamLevel,
  type ExamTerm,
} from "@/constants/ExamLevels";
import { useAuth } from "@/context/AuthContext";
import {
  uploadClassResultsToDatabase,
  fetchUploadedResults,
  labelsMatch,
  type CloudScanResult,
} from "@/lib/resultsService";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ImageView from "react-native-image-viewing";
let Sharing: typeof import('expo-sharing') | undefined;
try {
  Sharing = require('expo-sharing');
} catch {}

interface ExamResult {
  score: number;
  correct: number;
  total: number;
  grading: boolean[];
  student_answers?: string[];   // new
  correct_answers?: string[];   // new
  image: string;
  image_type: string;
  candidate_number?: string;
}

/*interface ExamResult {
  score: number;
  correct: number;
  total: number;
  grading: boolean[];
  image: string;
  image_type: string;
  candidate_number?: string;
}*/

interface StoredExamResult {
  id: string;
  timestamp: number;
  level: string;
  term: string;
  studentName?: string;
  examTitle?: string;
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

interface AnalysisData {
  totalExams: number;
  averageScore: number;
  passRate: number;
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    F: number;
  };
  recentExams: StoredExamResult[];
}

interface ImageAsset {
  uri: string;
  width?: number;
  height?: number;
}

const { width, height } = Dimensions.get("window");

// PC Wi-Fi IPv4 — phone and this computer must be on the same network
const BACKEND_URL = "http://192.168.0.114:3000";
const DEFAULT_QUESTION_COUNT = 40;
const ANSWER_OPTIONS = ["A", "B", "C", "D", "E"] as const;

function createAnswerKeySlots(
  count: number,
  existing: string[] = [],
  fillDefaultLetters = false
): string[] {
  return Array.from({ length: count }, (_, index) => {
    const current = existing[index]?.toUpperCase();
    if (current && /^[A-E]$/.test(current)) {
      return current;
    }
    if (fillDefaultLetters) {
      return ANSWER_OPTIONS[index % ANSWER_OPTIONS.length];
    }
    return "";
  });
}

export default function App() {
  const { user, loading: authLoading, logOut } = useAuth();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [questions, setQuestions] = useState(String(DEFAULT_QUESTION_COUNT));
  const [answers, setAnswers] = useState("");
  const [viewImage, setViewImage] = useState(false);
  const [viewSelectedImage, setViewSelectedImage] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showGuide, setShowGuide] = useState(true);
  const [showSetup, setShowSetup] = useState(true);
  const [scanMode, setScanMode] = useState<"camera" | "upload">("camera");
  const [storedResults, setStoredResults] = useState<StoredExamResult[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [viewAnalysisImage, setViewAnalysisImage] = useState<null | string>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredExams, setFilteredExams] = useState<StoredExamResult[] | null>(null);
  const [answerInputs, setAnswerInputs] = useState<string[]>(() =>
    createAnswerKeySlots(DEFAULT_QUESTION_COUNT, [], true)
  );
  const [selectedLevel, setSelectedLevel] = useState<ExamLevel | "">("");
  const [selectedTerm, setSelectedTerm] = useState<ExamTerm | "">("");
  const [analysisLevel, setAnalysisLevel] = useState<ExamLevel | "">("");
  const [analysisTerm, setAnalysisTerm] = useState<ExamTerm | "">("");
  const [uploadingToCloud, setUploadingToCloud] = useState(false);
  const [showCloudResults, setShowCloudResults] = useState(false);
  const [cloudResults, setCloudResults] = useState<CloudScanResult[]>([]);
  const [loadingCloudResults, setLoadingCloudResults] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Function to enforce 4:3 aspect ratio
  const enforceAspectRatio = async (imageUri: string): Promise<string> => {
    try {
      const imageInfo = await ImageManipulator.manipulateAsync(imageUri, [], {
        format: ImageManipulator.SaveFormat.JPEG,
      });

      const { width: imgWidth, height: imgHeight } = imageInfo;
      const targetRatio = 4 / 3;
      const currentRatio = imgWidth / imgHeight;

      let cropWidth = imgWidth;
      let cropHeight = imgHeight;
      let originX = 0;
      let originY = 0;

      if (currentRatio > targetRatio) {
        cropWidth = imgHeight * targetRatio;
        originX = (imgWidth - cropWidth) / 2;
      } else if (currentRatio < targetRatio) {
        cropHeight = imgWidth / targetRatio;
        originY = (imgHeight - cropHeight) / 2;
      }

      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropWidth,
              height: cropHeight,
            },
          },
          {
            resize: {
              width: 800,
              height: 600,
            },
          },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return manipulatedImage.uri;
    } catch (error) {
      console.error("Error enforcing aspect ratio:", error);
      return imageUri;
    }
  };

  // Pulse animation for guide
  React.useEffect(() => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => pulse());
    };
    pulse();
  }, []);

  const startScanning = () => {
    if (!selectedLevel) {
      Alert.alert("Error", "Please select a class level.");
      return;
    }
    if (!selectedTerm) {
      Alert.alert("Error", "Please select a term.");
      return;
    }
    if (!questions || questions < 1 || questions > 60) {
      Alert.alert("Error", "Please enter valid number of questions (1-60)");
      return;
    }

    const qNum = Number.parseInt(questions);

    // Try the new per-question inputs first
    let answerKeyArray: string[] = [];

    // If answerInputs are filled and valid, use them
    if (
      Array.isArray(answerInputs) &&
      answerInputs.length >= qNum &&
      answerInputs.slice(0, qNum).every(a => a && /^[A-Ea-e]$/.test(a))
    ) {
      answerKeyArray = answerInputs.slice(0, qNum).map(a => a.toUpperCase());
    }
    // Else fall back to the old single-string input
    else if (answers && answers.length === qNum && /^[A-Ea-e]+$/.test(answers)) {
      answerKeyArray = answers.toUpperCase().split('');
    } else {
      Alert.alert("Error", `Please provide exactly ${questions} answers (A-E).`);
      return;
    }

    // Keep the answers state consistent (optional, helps other code paths)
    setAnswers(answerKeyArray.join(''));
    /*if (!answers || answers.length !== Number.parseInt(questions)) {
      Alert.alert(
        "Error",
        `Please provide exactly ${questions} answers (A-E).`
      );
      return;
    }*/

    setScanMode("camera");
    setShowSetup(false);
    openCamera();
  };

  const openCamera = async () => {
    if (!permission) {
      return;
    }

    if (!permission.granted) {
      const permissionResult = await requestPermission();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "Camera permission is needed to take photos"
        );
        return;
      }
    }

    setShowCamera(true);
    setShowGuide(true);
  };

  const pickImageFromGallery = async () => {
    setResult(null);
    setImage(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]) {
        setShowManualUpload(true); // Show upload screen with loading
        setLoading(true);
        const processedImageUri = await enforceAspectRatio(
          result.assets[0].uri
        );
        await processImage(processedImageUri);
      } else {
        // User cancelled, go back to setup
        setShowManualUpload(false);
        setShowSetup(true);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image from gallery");
      setShowManualUpload(false);
      setShowSetup(true);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        setLoading(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          base64: false,
          skipProcessing: true,
          exif: false,
        });

        const processedImageUri = await enforceAspectRatio(photo.uri);
        await processImage(processedImageUri);
      } catch (error) {
        Alert.alert("Error", "Failed to take picture");
        setLoading(false);
      }
    }
  };

  const processImage = async (imageUri: string) => {
    const qNum = Number.parseInt(questions);

      // prefer answerInputs if available
      let keyArray: string[] = [];
      if (Array.isArray(answerInputs) && answerInputs.length >= qNum) {
        keyArray = answerInputs.slice(0, qNum).map(a => (a || '').toUpperCase());
      } else if (answers) {
        keyArray = answers.toUpperCase().split('').slice(0, qNum);
      }

    const convertedAnswers = keyArray
      .map((ans) => {
      if (ans >= "A" && ans <= "E") return ans.charCodeAt(0) - 65;
      return null;
      })
      .filter((ans) => ans !== null);
    /*const convertedAnswers = answers
      .toUpperCase()
      .split("")
      .map((ans) => {
        if (ans >= "A" && ans <= "E") return ans.charCodeAt(0) - 65;
        return null;
      })
      .filter((ans) => ans !== null);*/

    const formData = new FormData();
    formData.append("image", {
      uri: imageUri,
      name: "exam_sheet.jpg",
      type: "image/jpeg",
    } as any);
    formData.append("questions", questions);
    formData.append("answers", JSON.stringify(convertedAnswers));

    try {
      const response = await axios.post(
        `${BACKEND_URL}/process-image`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      // Check if the response contains an error
      if (response.data.error) {
        Alert.alert("Processing Error", response.data.error);
        setResult(null);
        setImage(null);
        return;
      }

      // Validate the response data before setting it
      if (
        !response.data.score ||
        !response.data.total ||
        response.data.total === 0
      ) {
        Alert.alert(
          "Invalid Result",
          "The processed image did not contain valid exam data. Please try again with a proper answer sheet."
        );
        setResult(null);
        setImage(null);
        return;
      }

      setResult(response.data);
      setImage(imageUri);
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error ||
        "Processing failed. Please ensure you're scanning a valid answer sheet.";
      Alert.alert("Error", errorMessage);
      setResult(null);
      setImage(null);
    } finally {
      setLoading(false);
    }
  };

  const scanAgain = () => {
    setResult(null);
    setImage(null);
    setLoading(false);
  };

  const goBackToSetup = () => {
    setShowCamera(false);
    setShowManualUpload(false);
    setShowSetup(true);
    setResult(null);
    setImage(null);
  };

  const getResultsForClass = (
    results: StoredExamResult[],
    level: string,
    term: string
  ) =>
    results.filter(
      (result) =>
        labelsMatch(result.level, level) &&
        labelsMatch(result.term, term) &&
        typeof result.percentage === "number" &&
        !isNaN(result.percentage) &&
        isFinite(result.percentage) &&
        result.percentage >= 0 &&
        result.percentage <= 100 &&
        typeof result.score === "number" &&
        typeof result.total === "number" &&
        result.total > 0
    );

  const classResultsCount = selectedLevel && selectedTerm
    ? getResultsForClass(storedResults, selectedLevel, selectedTerm).length
    : 0;

  const pendingUploadCount =
    selectedLevel && selectedTerm
      ? getResultsForClass(storedResults, selectedLevel, selectedTerm).filter(
          (result) => !result.uploadedToCloud
        ).length
      : 0;

  const markResultsAsUploaded = async (
    level: string,
    term: string,
    resultIds: string[]
  ) => {
    const updatedResults = storedResults.map((result) =>
      resultIds.includes(result.id)
        ? {
            ...result,
            uploadedToCloud: true,
            cloudUploadedAt: Date.now(),
          }
        : result
    );

    await AsyncStorage.setItem("examResults", JSON.stringify(updatedResults));
    setStoredResults(updatedResults);
  };

  const handleUploadToDatabase = async (
    level: string,
    term: string,
    fromAnalysis = false
  ) => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to upload results.");
      return;
    }

    if (!level || !term) {
      Alert.alert(
        "Select Class & Term",
        "Please choose a class level and term before uploading."
      );
      return;
    }

    const classResults = getResultsForClass(storedResults, level, term);
    const pending = classResults.filter((result) => !result.uploadedToCloud);

    if (classResults.length === 0) {
      Alert.alert(
        "No Results",
        `There are no scanned results for ${level}, ${term}.`
      );
      return;
    }

    if (pending.length === 0) {
      Alert.alert(
        "Already Uploaded",
        `All ${classResults.length} result(s) for ${level}, ${term} are already in the database.`
      );
      return;
    }

    Alert.alert(
      "Upload to Database",
      `Upload ${pending.length} scanned result(s) for ${level}, ${term}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: async () => {
            setUploadingToCloud(true);
            try {
              const { uploaded } = await uploadClassResultsToDatabase(
                user,
                level,
                term,
                storedResults
              );

              await markResultsAsUploaded(
                level,
                term,
                pending.map((result) => result.id)
              );

              if (fromAnalysis && analysisLevel && analysisTerm) {
                refreshAnalysisForFilters(analysisLevel, analysisTerm);
              }

              Alert.alert(
                "Upload Complete",
                `Saved ${uploaded} result(s) under ${level} → ${term} in Firebase.`
              );
            } catch (error) {
              Alert.alert(
                "Upload Failed",
                error instanceof Error
                  ? error.message
                  : "Could not upload results. Check your internet and Firebase setup."
              );
            } finally {
              setUploadingToCloud(false);
            }
          },
        },
      ]
    );
  };

  // Storage and Analysis Functions
  const calculateGrade = (percentage: number): string => {
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B";
    if (percentage >= 60) return "C";
    if (percentage >= 50) return "D";
    if (percentage >= 40) return "E";
    return "F";
  };

  const saveResult = async (examResult: ExamResult, forceSave = false) => {
    try {
      if (!selectedLevel || !selectedTerm) {
        console.error("Missing class level or term when saving result");
        return;
      }

      // Validate the exam result before saving
      if (
        !examResult ||
        typeof examResult.score !== "number" ||
        typeof examResult.total !== "number" ||
        examResult.total === 0 ||
        examResult.score < 0 ||
        examResult.score > examResult.total
      ) {
        console.error("Invalid exam result data:", examResult);
        return;
      }

      const percentage = (examResult.score / examResult.total) * 100;

      // Check for NaN or infinite values
      if (isNaN(percentage) || !isFinite(percentage)) {
        console.error("Invalid percentage calculated:", percentage);
        return;
      }

      const grade = calculateGrade(percentage);

      const storedResult: StoredExamResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        level: selectedLevel,
        term: selectedTerm,
        score: examResult.score,
        correct: examResult.correct,
        total: examResult.total,
        percentage,
        grade,
        grading: examResult.grading,
        image: examResult.image,
        candidate_number: examResult.candidate_number,
      };

      const existingResults = await AsyncStorage.getItem("examResults");
      const results: StoredExamResult[] = existingResults
        ? JSON.parse(existingResults)
        : [];

      // Duplicate candidate_number check within same class and term
      if (
        examResult.candidate_number &&
        !forceSave &&
        results.some(
          (r) =>
            r.candidate_number &&
            r.candidate_number === examResult.candidate_number &&
            r.level === selectedLevel &&
            r.term === selectedTerm
        )
      ) {
        Alert.alert(
          "Duplicate Index Number",
          `A result with index number "${examResult.candidate_number}" already exists for ${selectedLevel}, ${selectedTerm}. Do you want to discard this scan or save it anyway?`,
          [
            {
              text: "Discard",
              style: "cancel",
              onPress: () => {
                setResult(null);
                setImage(null);
              },
            },
            {
              text: "Save Anyway",
              style: "destructive",
              onPress: () => {
                // Save forcibly
                saveResult(examResult, true);
              },
            },
          ]
        );
        return;
      }

      results.push(storedResult);
      await AsyncStorage.setItem("examResults", JSON.stringify(results));

      setStoredResults(results);
    } catch (error) {
      console.error("Error saving result:", error);
    }
  };

  const loadStoredResults = async () => {
    try {
      const existingResults = await AsyncStorage.getItem("examResults");
      if (existingResults) {
        const results: StoredExamResult[] = JSON.parse(existingResults);

        // Clean up any invalid results
        const validResults = results.filter(
          (result) =>
            result &&
            typeof result.percentage === "number" &&
            !isNaN(result.percentage) &&
            isFinite(result.percentage) &&
            result.percentage >= 0 &&
            result.percentage <= 100 &&
            typeof result.score === "number" &&
            typeof result.total === "number" &&
            result.total > 0
        );

        // If we filtered out invalid results, save the cleaned data
        if (validResults.length !== results.length) {
          await AsyncStorage.setItem(
            "examResults",
            JSON.stringify(validResults)
          );
          console.log(
            `Cleaned up ${results.length - validResults.length} invalid results`
          );
        }

        setStoredResults(validResults);
      }
    } catch (error) {
      console.error("Error loading results:", error);
    }
  };

  const generateAnalysis = (
    level: string = analysisLevel,
    term: string = analysisTerm
  ): AnalysisData => {
    if (!level || !term) {
      return {
        totalExams: 0,
        averageScore: 0,
        passRate: 0,
        gradeDistribution: {
          A: 0,
          B: 0,
          C: 0,
          D: 0,
          E: 0,
          F: 0,
        },
        recentExams: [],
      };
    }

    const validResults = getResultsForClass(storedResults, level, term);

    if (validResults.length === 0) {
      return {
        totalExams: 0,
        averageScore: 0,
        passRate: 0,
        gradeDistribution: {
          A: 0,
          B: 0,
          C: 0,
          D: 0,
          E: 0,
          F: 0,
        },
        recentExams: [],
      };
    }

    const totalExams = validResults.length;
    const averageScore =
      validResults.reduce((sum, result) => sum + result.percentage, 0) /
      totalExams;
    const passRate =
      (validResults.filter((result) => result.percentage >= 40).length /
        totalExams) *
      100;

    const gradeDistribution = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
    };

    validResults.forEach((result) => {
      if (result.grade && gradeDistribution.hasOwnProperty(result.grade)) {
        gradeDistribution[result.grade as keyof typeof gradeDistribution]++;
      }
    });

    const recentExams = validResults.sort((a, b) => b.timestamp - a.timestamp);

    return {
      totalExams,
      averageScore,
      passRate,
      gradeDistribution,
      recentExams,
    };
  };

  const showAnalysisModal = () => {
    if (!selectedLevel || !selectedTerm) {
      Alert.alert("Select Class & Term", "Please choose a class level and term before viewing analysis.");
      return;
    }
    setAnalysisLevel(selectedLevel);
    setAnalysisTerm(selectedTerm);
    setSearchQuery("");
    setFilteredExams(null);
    const analysis = generateAnalysis(selectedLevel, selectedTerm);
    setAnalysisData(analysis);
    setShowAnalysis(true);
  };

  const refreshAnalysisForFilters = (level: string, term: string) => {
    setFilteredExams(null);
    setSearchQuery("");
    setAnalysisData(generateAnalysis(level, term));
  };

  const clearAllResults = async () => {
    if (!analysisLevel || !analysisTerm) return;

    Alert.alert(
      "Clear Class Results",
      `Delete all stored results for ${analysisLevel}, ${analysisTerm}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const remaining = storedResults.filter(
                (result) =>
                  result.level !== analysisLevel || result.term !== analysisTerm
              );
              await AsyncStorage.setItem(
                "examResults",
                JSON.stringify(remaining)
              );
              setStoredResults(remaining);
              setAnalysisData(generateAnalysis(analysisLevel, analysisTerm));
              setFilteredExams(null);
              Alert.alert(
                "Success",
                `Results cleared for ${analysisLevel}, ${analysisTerm}.`
              );
            } catch (error) {
              Alert.alert("Error", "Failed to clear results.");
            }
          },
        },
      ]
    );
  };

  // Save analysis to CSV and share
  const saveAnalysisToDevice = async () => {
    if (!analysisData) return;
    // Helper to convert image URI to base64 data URI
    const getBase64DataUri = async (uri: string) => {
      if (!uri) return '';
      try {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        return `data:image/jpeg;base64,${base64}`;
      } catch {
        return uri; // fallback to URI if not accessible
      }
    };
    // Build CSV rows with base64 images
    const csvRows = [
      "Level,Term,Index Number,Score,Total,Percentage,Grade,Date,ImageFile",
    ];
    for (let i = 0; i < analysisData.recentExams.length; i++) {
      const exam = analysisData.recentExams[i];
      const indexNumber = exam.candidate_number
        ? `Index: ${exam.candidate_number}`
        : `#${analysisData.totalExams - i}`;
      // Sanitize filename: remove spaces, colons, and hash for filesystem
      let imageFileName = exam.candidate_number
        ? `Index_${exam.candidate_number}.jpg`
        : `NoIndex_${analysisData.totalExams - i}.jpg`;
      imageFileName = imageFileName.replace(/[^a-zA-Z0-9_\-\.]/g, '');
      const imageFilePath = FileSystem.documentDirectory + imageFileName;
      try {
        await FileSystem.copyAsync({ from: exam.image, to: imageFilePath });
        csvRows.push([
          exam.level || analysisLevel,
          exam.term || analysisTerm,
          indexNumber,
          exam.score,
          exam.total,
          exam.percentage.toFixed(1) + '%',
          exam.grade,
          new Date(exam.timestamp).toLocaleString(),
          imageFileName
        ].join(','));
      } catch {
        csvRows.push([
          exam.level || analysisLevel,
          exam.term || analysisTerm,
          indexNumber,
          exam.score,
          exam.total,
          exam.percentage.toFixed(1) + '%',
          exam.grade,
          new Date(exam.timestamp).toLocaleString(),
          ''
        ].join(','));
      }
    }
    const csvString = csvRows.join('\n');
    const fileUri = FileSystem.documentDirectory + `mcq_analysis_${Date.now()}.csv`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });
      if (Sharing && Sharing.shareAsync) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Share or Save MCQ Analysis' });
      } else {
        Alert.alert('Saved', 'Analysis CSV saved to device, but sharing is not available.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to save or share analysis.');
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/(auth)/login" as Href);
    }
  }, [user, authLoading]);

  // Load stored results on component mount
  useEffect(() => {
    loadStoredResults();
  }, []);

  const handleSignOut = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logOut();
          router.replace("/(auth)/login" as Href);
        },
      },
    ]);
  };

  // Save result when new result is available
  useEffect(() => {
    if (result) {
      saveResult(result);
    }
  }, [result]);

  const handleSearch = () => {
    if (!analysisData) return;
    if (!searchQuery.trim()) {
      setFilteredExams(null);
      return;
    }
    const query = searchQuery.trim().toLowerCase();
    const filtered = analysisData.recentExams.filter(exam =>
      (exam.candidate_number && exam.candidate_number.toLowerCase().includes(query)) ||
      (exam.id && exam.id.toLowerCase().includes(query))
    );
    setFilteredExams(filtered);
  };

  const renderCameraGuide = () => {
    return (
      <View style={styles.guideContainer}>
        <Animated.View
          style={[
            styles.instructionContainer,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>
              📋 Position Answer Sheet
            </Text>
            <Text style={styles.instructionText}>
              • Align within the 4:3 frame{"\n"}• Ensure good lighting{"\n"}•
              Keep sheet flat and visible{"\n"}• Use dark pen/marker for answers
              {"\n"}• Ensure clear borders on answer sheet
            </Text>
          </View>
        </Animated.View>

        <TouchableOpacity
          style={styles.toggleGuideButton}
          onPress={() => setShowGuide(!showGuide)}
        >
          <Text style={styles.toggleGuideText}>
            {showGuide ? "Hide Guide" : "Show Guide"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBriefResults = () => {
    if (!result) return null;

    const percentage = (result.score / result.total) * 100;
    const grade = calculateGrade(percentage);

    return (
      <View style={styles.briefResultsOverlay}>
        <View style={styles.briefResultsContainer}>
          <View style={styles.briefScoreSection}>
            <View style={styles.briefScoreBox}>
              <Text style={styles.briefScoreText}>{result.score}</Text>
              <Text style={styles.briefScoreLabel}>Score</Text>
            </View>
            <View style={styles.briefStatsContainer}>
              <Text style={styles.briefStatsText}>
                {result.correct} of {result.total} correct
              </Text>
              <Text style={styles.briefPercentageText}>
                {percentage.toFixed(1)}% • {grade}
              </Text>
            </View>
            <Image
              source={{ uri: result.image }}
              style={{ width: 100, height: 100 }}
              resizeMode="contain"
            />
          </View>

          <View style={styles.briefButtonsContainer}>
            <TouchableOpacity
              style={styles.scanAgainButton}
              onPress={scanAgain}
            >
              <LinearGradient
                colors={[...AppTheme.primary]}
                style={styles.briefButtonGradient}
              >
                <Text style={styles.briefButtonText}>Scan Again</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.advancedButton}
              onPress={() => setShowDetailedResults(true)}
            >
              <LinearGradient
                colors={[...AppTheme.accent]}
                style={styles.briefButtonGradient}
              >
                <Text style={styles.briefButtonText}>View Details</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderDetailedResults = () => {
    if (!result) return null;

    return (
      <Modal visible={showDetailedResults} animationType="slide">
        <View style={styles.detailedResultsContainer}>
          <LinearGradient
            colors={[...AppTheme.gradient]}
            style={styles.detailedGradient}
          >
            <View style={styles.detailedHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setShowDetailedResults(false)}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.detailedTitle}>Detailed Results</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.detailedScrollView}>
              <View style={styles.detailedScoreContainer}>
                <LinearGradient
                  colors={[...AppTheme.primary]}
                  style={styles.detailedScoreBox}
                >
                  <Text style={styles.detailedScoreText}>{result.score}</Text>
                  <Text style={styles.detailedScoreLabel}>Final Score</Text>
                </LinearGradient>

                <View style={styles.detailedProgressContainer}>
                  <Text style={styles.detailedProgressText}>
                    {result.correct || 0}/{result.total || 0} Correct Answers
                  </Text>
                  <View style={styles.detailedProgressBar}>
                    <LinearGradient
                      colors={[...AppTheme.accent]}
                      style={[
                        styles.detailedProgressFill,
                        {
                          width: `${
                            result.total
                              ? (result.correct / result.total) * 100
                              : 0
                          }%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              {result.image && (
                <View style={styles.detailedImageSection}>
                  <Text style={styles.detailedSectionTitle}>
                    Processed Answer Sheet
                  </Text>
                  <TouchableOpacity
                    onPress={() => setViewImage(true)}
                    style={styles.detailedImageCard}
                  >
                    <Image
                      source={{ uri: result.image }}
                      style={styles.detailedProcessedImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.detailedTableSection}>
                <Text style={styles.detailedSectionTitle}>
                  Question by Question
                </Text>
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeader}>
                    <Text
                      style={[styles.tableHeaderText, styles.questionColumn]}
                    >
                      Q#
                    </Text>
                    <Text style={[styles.tableHeaderText, styles.answerColumn]}>
                      Correct
                    </Text>
                    <Text style={[styles.tableHeaderText, styles.answerColumn]}>
                      Student
                    </Text>
                    <Text style={[styles.tableHeaderText, styles.statusColumn]}>
                      Status
                    </Text>
                  </View>

                  {result.grading &&
                    Array.isArray(result.grading) &&
                    result.grading.map((isCorrect, index) => {
                      // Prefer server-provided correct/student answers when available
                      const correctAnswers =
                        Array.isArray(result.correct_answers) && result.correct_answers.length
                         ? result.correct_answers
                          : (Array.isArray(answerInputs) && answerInputs.length > 0)
                           ? answerInputs.map(a => (a || '-').toUpperCase())
                            : (answers ? answers.toUpperCase().split('') : []);

                      const studentAnswers = Array.isArray(result.student_answers) && result.student_answers.length
                        ? result.student_answers
                        : (Array.isArray(answerInputs) && answerInputs.length > 0
                          ? answerInputs.map(a => (a || "-").toUpperCase())
                          : (answers ? answers.toUpperCase().split("") : []));

                      const correctAnswer = correctAnswers[index] || "-";
                      const studentAnswer = studentAnswers[index] || "-";

                      return (
                        <View
                          key={index}
                          style={[
                            styles.tableRow,
                            index % 2 === 0 ? styles.evenRow : styles.oddRow,
                          ]}
                        >
                          <Text
                            style={[
                              styles.tableCellText,
                              styles.questionColumn,
                            ]}
                          >
                            {index + 1}
                          </Text>
                          <Text
                            style={[styles.tableCellText, styles.answerColumn]}
                          >
                            {correctAnswer}
                          </Text>
                          <Text
                            style={[styles.tableCellText, styles.answerColumn]}
                          >
                            {studentAnswer}
                          </Text>
                          <View
                            style={[styles.statusColumn, styles.statusCell]}
                          >
                            <LinearGradient
                              colors={
                                isCorrect
                                  ? [...AppTheme.accent]
                                  : ["#f56565", "#e53e3e"]
                              }
                              style={styles.statusIndicator}
                            >
                              <Text style={styles.statusText}>
                                {isCorrect ? "✓" : "✗"}
                              </Text>
                            </LinearGradient>
                          </View>
                        </View>
                      );
                    })}
                </View>
              </View>
            </ScrollView>
          </LinearGradient>
        </View>

        {result && (
          <ImageView
            images={[{ uri: result.image }]}
            imageIndex={0}
            visible={viewImage}
            onRequestClose={() => setViewImage(false)}
          />
        )}
      </Modal>
    );
  };

  const openUploadedResults = async () => {
    if (!user) {
      Alert.alert("Sign In Required", "Please sign in to view uploaded results.");
      return;
    }

    setShowCloudResults(true);
    setLoadingCloudResults(true);

    try {
      const results = await fetchUploadedResults(user.uid);
      setCloudResults(results);
    } catch (error) {
      setShowCloudResults(false);
      Alert.alert(
        "Could Not Load Results",
        error instanceof Error
          ? error.message
          : "Failed to fetch uploaded results from Firebase."
      );
    } finally {
      setLoadingCloudResults(false);
    }
  };

  const refreshUploadedResults = async () => {
    if (!user) return;

    setLoadingCloudResults(true);
    try {
      const results = await fetchUploadedResults(user.uid);
      setCloudResults(results);
    } catch (error) {
      Alert.alert(
        "Could Not Load Results",
        error instanceof Error
          ? error.message
          : "Failed to refresh uploaded results."
      );
    } finally {
      setLoadingCloudResults(false);
    }
  };

  const renderUploadedResultsModal = () => {
    const grouped = cloudResults.reduce<
      Record<string, { level: string; term: string; results: CloudScanResult[] }>
    >((acc, result) => {
      const key = `${result.level}|${result.term}`;
      if (!acc[key]) {
        acc[key] = { level: result.level, term: result.term, results: [] };
      }
      acc[key].results.push(result);
      return acc;
    }, {});

    const groups = Object.values(grouped).sort((a, b) => {
      const levelDiff =
        EXAM_LEVELS.indexOf(a.level as ExamLevel) -
        EXAM_LEVELS.indexOf(b.level as ExamLevel);
      if (levelDiff !== 0) return levelDiff;
      return (
        EXAM_TERMS.indexOf(a.term as ExamTerm) -
        EXAM_TERMS.indexOf(b.term as ExamTerm)
      );
    });

    return (
      <Modal visible={showCloudResults} animationType="slide">
        <View style={styles.analysisContainer}>
          <LinearGradient
            colors={[...AppTheme.gradient]}
            style={styles.analysisGradient}
          >
            <View style={styles.analysisHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowCloudResults(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.analysisTitle}>Uploaded Results</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={refreshUploadedResults}
                disabled={loadingCloudResults}
              >
                <Text style={styles.clearButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.analysisFilterSection}>
              <Text style={styles.analysisFilterLabel}>
                {cloudResults.length} uploaded result(s), grouped by class and term
              </Text>
            </View>

            <View style={styles.cloudResultsBody}>
              {loadingCloudResults ? (
                <View style={styles.cloudLoadingContainer}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={styles.cloudLoadingText}>Loading from Firebase...</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.analysisScrollView}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                >
                  {groups.length > 0 ? (
                    groups.map((group) => (
                      <View key={`${group.level}-${group.term}`} style={styles.cloudGroupSection}>
                        <Text style={styles.cloudGroupTitle}>
                          {group.level} • {group.term} ({group.results.length})
                        </Text>
                        {group.results.map((exam) => (
                          <View key={exam.id} style={styles.recentExamCard}>
                            <View style={styles.recentExamHeader}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.recentExamNumber}>
                                  {exam.candidate_number
                                    ? `Index: ${exam.candidate_number}`
                                    : `Scan ${exam.localId}`}
                                </Text>
                                <Text style={styles.recentExamMeta}>
                                  Uploaded{" "}
                                  {exam.uploadedAt
                                    ? exam.uploadedAt.toLocaleString()
                                    : "—"}
                                </Text>
                              </View>
                              <Text style={styles.recentExamDate}>
                                {exam.scannedAt.toLocaleDateString()}
                              </Text>
                            </View>
                            <View style={styles.recentExamStats}>
                              <View style={styles.recentExamStat}>
                                <Text style={styles.recentExamScore}>
                                  {exam.score}/{exam.total}
                                </Text>
                                <Text style={styles.recentExamLabel}>Score</Text>
                              </View>
                              <View style={styles.recentExamStat}>
                                <Text style={styles.recentExamPercentage}>
                                  {Number(exam.percentage || 0).toFixed(1)}%
                                </Text>
                                <Text style={styles.recentExamLabel}>Percentage</Text>
                              </View>
                              <View style={styles.recentExamStat}>
                                <Text
                                  style={[
                                    styles.recentExamGrade,
                                    { color: getGradeColor(exam.grade) },
                                  ]}
                                >
                                  {exam.grade}
                                </Text>
                                <Text style={styles.recentExamLabel}>Grade</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No uploaded results yet</Text>
                      <Text style={styles.emptyStateSubtext}>
                        Upload scanned results from the setup screen to see them here,
                        grouped by class and term.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </LinearGradient>
        </View>
      </Modal>
    );
  };

  const renderAnalysisModal = () => {
    if (!analysisData) return null;

    const examsToShow = filteredExams !== null ? filteredExams : analysisData.recentExams;

    return (
      <Modal visible={showAnalysis} animationType="slide">
        <View style={styles.analysisContainer}>
          <LinearGradient
            colors={[...AppTheme.gradient]}
            style={styles.analysisGradient}
          >
            {/* Header */}
            <View style={styles.analysisHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowAnalysis(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.analysisTitle}>Exam Analysis</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearAllResults}
              >
                <Text style={styles.clearButtonText}>Clear Class</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.analysisFilterSection}>
              <Text style={styles.analysisFilterLabel}>
                Viewing: {analysisLevel || "—"}, {analysisTerm || "—"}
              </Text>
              <Text style={styles.analysisFilterSubLabel}>Class Level</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {EXAM_LEVELS.map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.chip,
                      analysisLevel === level && styles.chipSelected,
                    ]}
                    onPress={() => {
                      setAnalysisLevel(level);
                      if (analysisTerm) {
                        refreshAnalysisForFilters(level, analysisTerm);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        analysisLevel === level && styles.chipTextSelected,
                      ]}
                    >
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.analysisFilterSubLabel}>Term</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {EXAM_TERMS.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={[
                      styles.chip,
                      analysisTerm === term && styles.chipSelected,
                    ]}
                    onPress={() => {
                      setAnalysisTerm(term);
                      if (analysisLevel) {
                        refreshAnalysisForFilters(analysisLevel, term);
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        analysisTerm === term && styles.chipTextSelected,
                      ]}
                    >
                      {term}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {/* Search Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', margin: 16 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: 'white', borderRadius: 8, padding: 8, marginRight: 8 }}
                placeholder="Search by Index Number"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#888"
              />
              <TouchableOpacity
                style={{ backgroundColor: AppTheme.primary[0], borderRadius: 8, padding: 10 }}
                onPress={handleSearch}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Search</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginLeft: 8, backgroundColor: AppTheme.warning[0], borderRadius: 8, padding: 10 }}
                onPress={() => { setSearchQuery(''); setFilteredExams(null); }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Reset</Text>
              </TouchableOpacity>
            </View>
            {/* Save Analysis Button */}
            <TouchableOpacity
              style={{ margin: 16, alignSelf: 'center', backgroundColor: AppTheme.accent[0], borderRadius: 8, padding: 12 }}
              onPress={saveAnalysisToDevice}
              disabled={uploadingToCloud}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Save Analysis to Device</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                marginHorizontal: 16,
                marginBottom: 8,
                alignSelf: 'center',
                backgroundColor: AppTheme.success,
                borderRadius: 8,
                padding: 12,
                minWidth: 260,
                alignItems: 'center',
                opacity: uploadingToCloud ? 0.7 : 1,
              }}
              onPress={() =>
                analysisLevel &&
                analysisTerm &&
                handleUploadToDatabase(analysisLevel, analysisTerm, true)
              }
              disabled={uploadingToCloud || !analysisLevel || !analysisTerm}
            >
              {uploadingToCloud ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                  Upload Results to Database
                </Text>
              )}
            </TouchableOpacity>
            {analysisLevel && analysisTerm ? (
              <Text style={styles.uploadHintText}>
                {(() => {
                  const pending = getResultsForClass(
                    storedResults,
                    analysisLevel,
                    analysisTerm
                  ).filter((result) => !result.uploadedToCloud).length;
                  const total = getResultsForClass(
                    storedResults,
                    analysisLevel,
                    analysisTerm
                  ).length;
                  return pending > 0
                    ? `${pending} of ${total} result(s) ready to upload for ${analysisLevel}, ${analysisTerm}`
                    : total > 0
                      ? `All ${total} result(s) uploaded for ${analysisLevel}, ${analysisTerm}`
                      : `No results to upload for ${analysisLevel}, ${analysisTerm}`;
                })()}
              </Text>
            ) : null}

            <ScrollView
              style={styles.analysisScrollView}
              showsVerticalScrollIndicator={false}
            >
              {/* Overview Stats */}
              <View style={styles.overviewSection}>
                <Text style={styles.sectionTitle}>📊 Overview</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {analysisData.totalExams}
                    </Text>
                    <Text style={styles.statLabel}>Total Exams</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {analysisData.averageScore.toFixed(1)}%
                    </Text>
                    <Text style={styles.statLabel}>Average Score</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {analysisData.passRate.toFixed(1)}%
                    </Text>
                    <Text style={styles.statLabel}>Pass Rate</Text>
                  </View>
                </View>
              </View>

              {/* Grade Distribution */}
              <View style={styles.gradeSection}>
                <Text style={styles.sectionTitle}>📈 Grade Distribution</Text>
                <View style={styles.gradeContainer}>
                  {Object.entries(analysisData.gradeDistribution).map(
                    ([grade, count]) => (
                      <View key={grade} style={styles.gradeItem}>
                        <View style={styles.gradeBar}>
                          <View
                            style={[
                              styles.gradeBarFill,
                              {
                                width: `${
                                  analysisData.totalExams > 0
                                    ? (count / analysisData.totalExams) * 100
                                    : 0
                                }%`,
                                backgroundColor: getGradeColor(grade),
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.gradeInfo}>
                          <Text style={styles.gradeText}>{grade}</Text>
                          <Text style={styles.gradeCount}>{count}</Text>
                        </View>
                      </View>
                    )
                  )}
                </View>
              </View>

              {/* Recent Exams */}
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>🕒 Recent Exams</Text>
                {examsToShow.length > 0 ? (
                  <View style={styles.recentExamsContainer}>
                    {examsToShow.map((exam, index) => (
                      <View key={exam.id} style={styles.recentExamCard}>
                        <View style={styles.recentExamHeader}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recentExamNumber}>
                              {exam.candidate_number
                                ? `Index: ${exam.candidate_number}`
                                : `#${analysisData.totalExams - index}`}
                            </Text>
                            <Text style={styles.recentExamMeta}>
                              {exam.level}, {exam.term}
                              {exam.uploadedToCloud ? " • ☁️ Uploaded" : ""}
                            </Text>
                          </View>
                          <Text style={styles.recentExamDate}>
                            {new Date(exam.timestamp).toLocaleDateString()}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setViewAnalysisImage(exam.image)}
                          style={{ alignSelf: 'center', marginBottom: 8 }}
                        >
                          <Image
                            source={{ uri: exam.image }}
                            style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: '#fff' }}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                        <View style={styles.recentExamStats}>
                          <View style={styles.recentExamStat}>
                            <Text style={styles.recentExamScore}>
                              {exam.score}/{exam.total}
                            </Text>
                            <Text style={styles.recentExamLabel}>Score</Text>
                          </View>
                          <View style={styles.recentExamStat}>
                            <Text style={styles.recentExamPercentage}>
                              {exam.percentage.toFixed(1)}%
                            </Text>
                            <Text style={styles.recentExamLabel}>
                              Percentage
                            </Text>
                          </View>
                          <View style={styles.recentExamStat}>
                            <Text
                              style={[
                                styles.recentExamGrade,
                                { color: getGradeColor(exam.grade) },
                              ]}
                            >
                              {exam.grade}
                            </Text>
                            <Text style={styles.recentExamLabel}>Grade</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      No valid exams analyzed yet
                    </Text>
                    <Text style={styles.emptyStateSubtext}>
                      Scan some answer sheets to see analysis. Make sure to use
                      clear, well-lit images of answer sheets.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </LinearGradient>
        </View>
        {/* ImageView for analysis images */}
        <ImageView
          images={viewAnalysisImage ? [{ uri: viewAnalysisImage }] : []}
          imageIndex={0}
          visible={!!viewAnalysisImage}
          onRequestClose={() => setViewAnalysisImage(null)}
        />
      </Modal>
    );
  };

  const getGradeColor = (grade: string): string => {
    switch (grade) {
      case "A":
        return "#48bb78";
      case "B":
        return "#9ae6b4";
      case "C":
        return "#ed8936";
      case "D":
        return "#f6e05e";
      case "E":
        return "#f6ad55";
      case "F":
        return "#c53030";
      default:
        return "#718096";
    }
  };

  const renderCamera = () => {
    return (
      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraContainer}>
          {/* Top header bar */}
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={goBackToSetup}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.cameraTitleContainer}>
              <Text style={styles.cameraTitle}>Camera Scanner</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          {/* Camera View Container - Full width and height */}
          <View style={styles.cameraViewContainerFixed}>
            <CameraView
              ref={cameraRef}
              style={styles.centeredCameraFixed}
              facing="back"
              ratio="4:3"
              pictureSize="high"
            />
            {/* Overlays positioned absolutely on top of camera */}
            {showGuide && !result && renderCameraGuide()}
            {result && renderBriefResults()}
          </View>

          {/* Bottom footer bar */}
          <View style={styles.cameraFooter}>
            <View style={styles.captureButtonContainer}>
              {!result && (
                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    loading && styles.captureButtonDisabled,
                  ]}
                  onPress={takePicture}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="large" />
                  ) : (
                    <LinearGradient
                      colors={["#ffffff", "#f7fafc"]}
                      style={styles.captureButtonInner}
                    />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        {/* Detailed Results Modal - Outside camera modal */}
        {renderDetailedResults()}
      </Modal>
    );
  };

  const renderManualUpload = () => {
    return (
      <Modal visible={showManualUpload} animationType="slide">
        <View style={styles.uploadContainer}>
          <LinearGradient
            colors={[...AppTheme.gradient]}
            style={styles.uploadGradient}
          >
            <View style={styles.uploadHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={goBackToSetup}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
              <View style={styles.uploadTitleContainer}>
                <Text style={styles.uploadTitle}>Processing Upload</Text>
              </View>
              <View style={styles.placeholder} />
            </View>

            <View style={styles.uploadContent}>
              {loading && !result && (
                <View style={styles.uploadLoadingContainer}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={styles.uploadLoadingText}>
                    Processing image...
                  </Text>
                </View>
              )}

              {result && renderBriefResults()}
            </View>
          </LinearGradient>
        </View>

        {/* Detailed Results Modal */}
        {renderDetailedResults()}
      </Modal>
    );
  };

  const renderAnswerKeyInputs = () => {
    const qNum = parseInt(questions) || 0;
    if (!qNum || qNum < 1 || qNum > 60) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 }}
      >
        {Array.from({ length: qNum }).map((_, idx) => (
          <View key={idx} style={{ alignItems: 'center', marginHorizontal: 4 }}>
            <Text style={{ color: 'white', fontSize: 12, marginBottom: 2 }}>{idx + 1}</Text>
            <TextInput
              style={{
                width: 32,
                height: 36,
                borderRadius: 8,
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: 'white',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: 16,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.3)',
              }}
              maxLength={1}
              value={answerInputs[idx] || ''}
              onChangeText={txt => {
                const val = txt.replace(/[^A-Ea-e]/, '').toUpperCase();
                const arr = [...answerInputs];
                arr[idx] = val;
                setAnswerInputs(arr);
              }}
              autoCapitalize="characters"
              keyboardType="default"
              placeholder="-"
              placeholderTextColor="rgba(255,255,255,0.4)"
            />
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderChipSelector = <T extends string>(
    label: string,
    options: readonly T[],
    selected: T | "",
    onSelect: (value: T) => void
  ) => (
    <View style={styles.inputCard}>
      <Text style={styles.inputLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(option)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.chipText, isSelected && styles.chipTextSelected]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderSetup = () => {
    return (
      <View style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={AppTheme.statusBar} />
        <LinearGradient
          colors={[...AppTheme.gradient]}
          style={styles.gradient}
        >
          <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
            <ScrollView
              contentContainerStyle={styles.container}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.topBar}>
                <TouchableOpacity
                  style={styles.signOutButton}
                  onPress={handleSignOut}
                >
                  <MaterialIcons name="logout" size={22} color="white" />
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.header}>
                <Text style={styles.title}>MCQ Scanner Setup</Text>
                {user?.displayName ? (
                  <Text style={styles.userGreeting}>
                    Signed in as {user.displayName}
                  </Text>
                ) : null}
              </View>

              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>📝 Exam Configuration</Text>

                {renderChipSelector(
                  "Class Level",
                  EXAM_LEVELS,
                  selectedLevel,
                  setSelectedLevel
                )}

                {renderChipSelector(
                  "Term",
                  EXAM_TERMS,
                  selectedTerm,
                  setSelectedTerm
                )}

                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>Number of Questions</Text>
                  <TextInput
                    style={styles.glassInput}
                    placeholder="Enter 1-60"
                    placeholderTextColor="rgba(255, 255, 255, 0.6)"
                    keyboardType="number-pad"
                    value={questions}
                    onChangeText={txt => {
                      const cleaned = txt.replace(/[^0-9]/g, "");
                      setQuestions(cleaned);
                      const qNum = Number.parseInt(cleaned, 10);
                      if (qNum >= 1 && qNum <= 60) {
                        setAnswerInputs((prev) =>
                          createAnswerKeySlots(qNum, prev, true)
                        );
                      }
                    }}
                  />
                </View>

                <View style={styles.inputCard}>
                  <Text style={styles.inputLabel}>Answer Key</Text>
                  {renderAnswerKeyInputs()}
                  {/* Hide the old single input, but keep for accessibility if needed */}
                  {/* 
                  <TextInput
                    style={styles.glassInput}
                    placeholder="e.g., ABCDE"
                    placeholderTextColor="rgba(255, 255, 255, 0.6)"
                    value={answers}
                    onChangeText={setAnswers}
                  />
                  */}
                </View>

                <View style={styles.scanModeSection}>
                  <Text style={styles.sectionTitle}>📷 Start Scanning</Text>

                  <View style={styles.modeButtonsContainer}>
                    <TouchableOpacity
                      style={styles.modeButton}
                      onPress={startScanning}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[...AppTheme.primary]}
                        style={styles.modeButtonGradient}
                      >
                        <Text style={styles.modeButtonIcon}>📷</Text>
                        <Text style={styles.modeButtonTitle}>Camera Mode</Text>
                        <Text style={styles.modeButtonText}>
                          Use live camera to scan answer sheets
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Analysis Section */}
                <View style={styles.analysisSection}>
                  <Text style={styles.sectionTitle}>
                    📊 Analysis & Insights
                  </Text>

                  <TouchableOpacity
                    style={styles.analysisButton}
                    onPress={showAnalysisModal}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[...AppTheme.warning]}
                      style={styles.analysisButtonGradient}
                    >
                      <Text style={styles.analysisButtonIcon}>📈</Text>
                      <Text style={styles.analysisButtonTitle}>
                        View Analysis
                      </Text>
                      <Text style={styles.analysisButtonText}>
                        {selectedLevel && selectedTerm
                          ? classResultsCount > 0
                            ? `${classResultsCount} result${
                                classResultsCount > 1 ? "s" : ""
                              } for ${selectedLevel}, ${selectedTerm}`
                            : `No results yet for ${selectedLevel}, ${selectedTerm}`
                          : "Select class and term to view analysis"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.uploadCloudButton,
                      uploadingToCloud && styles.uploadCloudButtonDisabled,
                    ]}
                    onPress={() =>
                      selectedLevel &&
                      selectedTerm &&
                      handleUploadToDatabase(selectedLevel, selectedTerm)
                    }
                    disabled={
                      uploadingToCloud || !selectedLevel || !selectedTerm
                    }
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={["#22c55e", "#16a34a"]}
                      style={styles.analysisButtonGradient}
                    >
                      {uploadingToCloud ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Text style={styles.analysisButtonIcon}>☁️</Text>
                          <Text style={styles.analysisButtonTitle}>
                            Upload to Database
                          </Text>
                          <Text style={styles.analysisButtonText}>
                            {selectedLevel && selectedTerm
                              ? pendingUploadCount > 0
                                ? `${pendingUploadCount} pending for ${selectedLevel}, ${selectedTerm}`
                                : classResultsCount > 0
                                  ? `All ${classResultsCount} uploaded for ${selectedLevel}, ${selectedTerm}`
                                  : `No results for ${selectedLevel}, ${selectedTerm}`
                              : "Select class and term first"}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.uploadCloudButton}
                    onPress={openUploadedResults}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[...AppTheme.primary]}
                      style={styles.analysisButtonGradient}
                    >
                      <Text style={styles.analysisButtonIcon}>🗂️</Text>
                      <Text style={styles.analysisButtonTitle}>
                        View Uploaded Results
                      </Text>
                          <Text style={styles.analysisButtonText}>
                            All uploaded results from Firebase, grouped by class and term
                          </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </View>
    );
  };

  if (authLoading || !user) {
    return (
      <View style={styles.authLoadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <>
      {showSetup && renderSetup()}
      {renderCamera()}
      {renderManualUpload()}
      {renderAnalysisModal()}
      {renderUploadedResultsModal()}
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    paddingVertical: 20,
    paddingTop: 30,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
    paddingTop: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  signOutText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  userGreeting: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  authLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: AppTheme.statusBar,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
    textAlign: "center",
  },
  formSection: {
    marginBottom: 30,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  chipSelected: {
    backgroundColor: "rgba(139, 92, 246, 0.45)",
    borderColor: "#c4b5fd",
  },
  chipText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#fff",
  },
  analysisFilterSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  analysisFilterLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  analysisFilterSubLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 4,
  },
  inputCard: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  inputLabel: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  glassInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    color: "white",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  // Scan Mode Selection
  scanModeSection: {
    marginTop: 20,
  },
  modeButtonsContainer: {
    gap: 16,
  },
  modeButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  modeButtonGradient: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  modeButtonTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modeButtonText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // Analysis Section
  analysisSection: {
    marginTop: 20,
    gap: 16,
  },
  uploadCloudButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  uploadCloudButtonDisabled: {
    opacity: 0.7,
  },
  uploadHintText: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
    fontSize: 13,
  },
  cloudLoadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  cloudLoadingText: {
    color: "rgba(255,255,255,0.85)",
    marginTop: 12,
    fontSize: 15,
  },
  cloudGroupSection: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  cloudGroupTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  cloudResultsBody: {
    flex: 1,
  },
  analysisButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  analysisButtonGradient: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  analysisButtonIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  analysisButtonTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  analysisButtonText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // Camera styles
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  darkBar: {
    backgroundColor: "#000000",
    flex: 1,
    justifyContent: "center",
  },
  cameraViewContainer: {
    aspectRatio: 4 / 3,
    width: "100%",
    backgroundColor: "#000000",
    position: "relative",
  },
  cameraViewContainerFixed: {
    aspectRatio: 4 / 3,
    width: "100%",
    backgroundColor: "#000000",
    position: "relative",
  },
  centeredCamera: {
    flex: 1,
    width: "100%",
  },
  centeredCameraFixed: {
    flex: 1,
    width: "100%",
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 20,
  },
  cameraFooter: {
    paddingVertical: 40,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  closeButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  cameraTitleContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  cameraTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  placeholder: {
    width: 44,
  },
  captureButtonContainer: {
    alignItems: "center",
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  // Manual Upload styles
  uploadContainer: {
    flex: 1,
  },
  uploadGradient: {
    flex: 1,
    paddingTop: 40,
  },
  uploadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  uploadTitleContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  uploadTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  uploadContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  uploadLoadingContainer: {
    alignItems: "center",
  },
  uploadLoadingText: {
    color: "white",
    fontSize: 18,
    marginTop: 16,
    fontWeight: "600",
  },
  // Brief Results Overlay
  briefResultsOverlay: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  briefResultsContainer: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  briefScoreSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  briefScoreBox: {
    alignItems: "center",
    marginRight: 20,
  },
  briefScoreText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  briefScoreLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  briefStatsContainer: {
    flex: 1,
  },
  briefStatsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
    marginBottom: 4,
  },
  briefPercentageText: {
    fontSize: 24,
    fontWeight: "bold",
    color: AppTheme.accent[0],
  },
  briefButtonsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  scanAgainButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  advancedButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  briefButtonGradient: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  briefButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  briefProcessedImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  // Camera Guide styles
  guideContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  instructionBox: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    maxWidth: 280,
  },
  instructionTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  instructionText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "left",
  },
  toggleGuideButton: {
    position: "absolute",
    top: 80,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  toggleGuideText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  // Detailed Results Modal
  detailedResultsContainer: {
    flex: 1,
  },
  detailedGradient: {
    flex: 1,
    paddingTop: 40,
  },
  detailedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  backButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  backButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  detailedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  detailedScrollView: {
    flex: 1,
    padding: 20,
  },
  detailedScoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  detailedScoreBox: {
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 20,
    minWidth: 80,
  },
  detailedScoreText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
  },
  detailedScoreLabel: {
    fontSize: 12,
    color: "white",
    marginTop: 4,
  },
  detailedProgressContainer: {
    flex: 1,
  },
  detailedProgressText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "white",
  },
  detailedProgressBar: {
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
    overflow: "hidden",
  },
  detailedProgressFill: {
    height: "100%",
    borderRadius: 6,
  },
  detailedImageSection: {
    marginBottom: 24,
  },
  detailedSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginBottom: 12,
  },
  detailedImageCard: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  detailedProcessedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  detailedTableSection: {
    marginBottom: 24,
  },
  tableContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  evenRow: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  oddRow: {
    backgroundColor: "transparent",
  },
  tableCellText: {
    fontSize: 14,
    color: "white",
    textAlign: "center",
  },
  questionColumn: {
    flex: 1,
  },
  answerColumn: {
    flex: 1.5,
  },
  statusColumn: {
    flex: 1.5,
  },
  statusCell: {
    alignItems: "center",
    justifyContent: "center",
  },
  statusIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  // Analysis Modal Styles
  analysisContainer: {
    flex: 1,
  },
  analysisGradient: {
    flex: 1,
    paddingTop: 40,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  clearButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  clearButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  analysisScrollView: {
    flex: 1,
    padding: 20,
  },
  overviewSection: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  statCard: {
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
  },
  gradeSection: {
    marginBottom: 24,
  },
  gradeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 10,
  },
  gradeItem: {
    alignItems: "center",
    width: "30%", // Adjust for 3 columns
  },
  gradeBar: {
    width: "100%",
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 8,
  },
  gradeBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  gradeInfo: {
    alignItems: "center",
  },
  gradeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },
  gradeCount: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
  },
  recentSection: {
    marginBottom: 24,
  },
  recentExamsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  recentExamCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  recentExamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recentExamNumber: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
  },
  recentExamMeta: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 2,
  },
  recentExamDate: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
  },
  recentExamStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  recentExamStat: {
    alignItems: "center",
  },
  recentExamScore: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
  },
  recentExamLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
  },
  recentExamPercentage: {
    fontSize: 16,
    fontWeight: "bold",
    color: AppTheme.accent[0],
  },
  recentExamGrade: {
    fontSize: 16,
    fontWeight: "bold",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyStateText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    textAlign: "center",
  },
});
