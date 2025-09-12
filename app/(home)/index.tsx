import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import {
  Alert,
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");

export default function GetStartedScreen() {
  const features = [
    {
      icon: "📷",
      title: "Smart Camera",
      description: "Capture answer sheets with our intelligent camera system",
    },
    {
      icon: "🔍",
      title: "Auto Detection",
      description: "Automatically detect and process multiple choice answers",
    },
    {
      icon: "📊",
      title: "Instant Results",
      description: "Get detailed grading results with visual feedback",
    },
    {
      icon: "📱",
      title: "Easy to Use",
      description: "Simple interface designed for teachers and educators",
    },
  ];

  function onGetStarted() {
    router.push("/(home)/main");
  }

  const downloadSheets = async () => {
    try {
      // Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant permission to save files to your device."
        );
        return;
      }

      // Use Asset.fromModule to properly handle image assets
      const sheet1Asset = Asset.fromModule(
        require("../../assets/images/OBJ PDF.jpg")
      );
      const sheet2Asset = Asset.fromModule(
        require("../../assets/images/OBJPDF-1.jpg")
      );

      // Download the assets to get their local URIs
      await sheet1Asset.downloadAsync();
      await sheet2Asset.downloadAsync();

      // Copy assets to document directory first
      const file1Uri = FileSystem.documentDirectory + "MCQ_Sheet_1.jpg";
      const file2Uri = FileSystem.documentDirectory + "MCQ_Sheet_2.jpg";

      // Copy the first sheet
      await FileSystem.copyAsync({
        from: sheet1Asset.localUri,
        to: file1Uri,
      });

      // Copy the second sheet
      await FileSystem.copyAsync({
        from: sheet2Asset.localUri,
        to: file2Uri,
      });

      // Save to media library
      const asset1 = await MediaLibrary.createAssetAsync(file1Uri);
      const asset2 = await MediaLibrary.createAssetAsync(file2Uri);

      // Create album if it doesn't exist
      const albumName = "MCQ Answer Sheets";
      let album = await MediaLibrary.getAlbumAsync(albumName);
      if (!album) {
        album = await MediaLibrary.createAlbumAsync(albumName, asset1, false);
      }

      // Add both assets to the album
      await MediaLibrary.addAssetsToAlbumAsync([asset1, asset2], album, false);

      Alert.alert(
        "Download Complete!",
        'Two MCQ answer sheets have been saved to your device in the "MCQ Answer Sheets" album.',
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert(
        "Download Failed",
        "Failed to save the answer sheets. Please make sure the image files exist in assets/images/ folder."
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a365d" />

      <LinearGradient
        colors={["#0f172a", "#1e293b", "#334155"]}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoIcon}>📝</Text>
            </View>
            <Text style={styles.title}>MCQ Marker</Text>
            <Text style={styles.subtitle}>
              Professional Exam Grading System
            </Text>
          </View>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>Grade Exams in Seconds</Text>
            <Text style={styles.heroDescription}>
              Transform your exam grading process with AI-powered answer sheet
              scanning and instant results
            </Text>
          </View>

          {/* Features Section */}
          <View style={styles.featuresSection}>
            <Text style={styles.featuresTitle}>Key Features</Text>
            <View style={styles.featuresGrid}>
              {features.map((feature, index) => (
                <View key={index} style={styles.featureCard}>
                  <Text style={styles.featureIcon}>{feature.icon}</Text>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>
                    {feature.description}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Stats Section */}
          <View style={styles.statsSection}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>60</Text>
              <Text style={styles.statLabel}>Max Questions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>5</Text>
              <Text style={styles.statLabel}>Answer Choices</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>99%</Text>
              <Text style={styles.statLabel}>Accuracy</Text>
            </View>
          </View>

          {/* CTA Section */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={downloadSheets}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#4299e1", "#3182ce"]}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>📥 Download Sheets</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={onGetStarted}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#48bb78", "#38a169"]}
                style={styles.buttonGradient}
              >
                <Text style={styles.buttonText}>Get Started</Text>
                <Text style={styles.buttonIcon}>→</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.footerText}>
              Perfect for teachers, educators, and institutions
            </Text>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  logoIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 40,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 34,
  },
  heroDescription: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  featuresSection: {
    paddingVertical: 40,
  },
  featuresTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom: 30,
  },
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  featureCard: {
    width: (width - 60) / 2,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
    textAlign: "center",
  },
  featureDescription: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
    lineHeight: 16,
  },
  statsSection: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 24,
    marginVertical: 20,
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    marginHorizontal: 20,
  },
  ctaSection: {
    alignItems: "center",
    paddingVertical: 40,
    paddingBottom: 60,
  },
  downloadButton: {
    width: width - 80,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  getStartedButton: {
    width: width - 80,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 16,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginRight: 8,
  },
  buttonIcon: {
    fontSize: 18,
    color: "white",
    fontWeight: "bold",
  },
  footerText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    fontStyle: "italic",
  },
});
