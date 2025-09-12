const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// File upload configuration
const upload = multer({ dest: "uploads/" });

app.post("/process-image", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  console.log("Received answers:", req.body.answers);

  const noQuestions = Number.parseInt(req.body.questions);
  if (isNaN(noQuestions) || noQuestions <= 0 || noQuestions > 60) {
    cleanup(req.file.path);
    return res.status(400).json({ error: "Invalid question count (1-60)" });
  }

  // Parse the answers array from the request
  const answers = JSON.parse(req.body.answers || "[]");
  if (!Array.isArray(answers) || answers.length !== noQuestions) {
    cleanup(req.file.path);
    return res.status(400).json({ error: "Invalid answers array" });
  }

  // Pass the answers as a single JSON string argument
  const python = spawn("python", [
    "scan.py",
    req.file.path,
    noQuestions.toString(),
    JSON.stringify(answers), // Pass as a single JSON string
  ]);

  let resultData = "";
  let errorData = "";

  python.stdout.on("data", (data) => (resultData += data.toString()));
  python.stderr.on("data", (data) => (errorData += data.toString()));

  python.on("close", (code) => {
    cleanup(req.file.path);

    if (code !== 0) {
      return res.status(500).json({
        error: "Processing failed",
        details: errorData,
      });
    }

    try {
      const result = JSON.parse(resultData);

      if (result.image) {
        // Convert base64 to data URL
        result.image = `data:image/${result.image_type};base64,${result.image}`;
        delete result.image_type;
      }

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Invalid processing output" });
    }
  });
});

function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.error("Error cleaning up file:", err);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
