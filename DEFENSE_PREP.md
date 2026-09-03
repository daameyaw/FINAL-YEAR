# MCQ Marker — Final Year Defense Preparation

> Based on actual codebase analysis. Distinction made between implemented features and marketing claims.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [How the System Works (End-to-End)](#3-how-the-system-works-end-to-end)
4. [scan.py — Detailed Algorithm Walkthrough](#4-scanpy--detailed-algorithm-walkthrough)
5. [Feature Breakdown](#5-feature-breakdown)
6. [Data Storage](#6-data-storage)
7. [Authentication & Security](#7-authentication--security)
8. [API Reference](#8-api-reference)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Backend Architecture](#10-backend-architecture)
11. [User Journeys](#11-user-journeys)
12. [Technical Decisions](#12-technical-decisions)
13. [Testing](#13-testing)
14. [Strengths, Weaknesses & Future Work](#14-strengths-weaknesses--future-work)
15. [Defense Cheat Sheet](#15-defense-cheat-sheet)
16. [Top 20 Exam Questions](#16-top-20-exam-questions)

---

## 1. Project Overview

### Title
**MCQ Marker** (`MCQs_Marker` / `mcqs_marker`)

### Problem
Teachers and institutions grade multiple-choice exams **manually**. This is slow, repetitive, and prone to human error — especially with large classes.

### Solution
A mobile app that scans filled OMR (Optical Mark Recognition) answer sheets using the phone camera or gallery, sends the image to a backend, and uses **computer vision (OpenCV)** to detect filled bubbles and calculate scores automatically.

### Aim
Automate MCQ exam grading through mobile capture + image processing, with instant results and basic class analytics.

### Objectives
1. Capture/upload answer sheet images from mobile
2. Accept exam config: 1–60 questions, A–E answer key
3. Detect and grade bubbles using OpenCV
4. Display per-question results with visual overlay
5. Store results locally with analytics and CSV export
6. Provide downloadable printable answer sheet templates

### Target Users
- Teachers and educators
- Schools and institutions running MCQ exams

### Major Features

| Feature | File(s) | Status |
|---------|---------|--------|
| Landing / onboarding | `app/(home)/index.tsx` | ✅ |
| Download answer sheets | `index.tsx` | ✅ |
| Exam setup | `app/(home)/main.tsx` | ✅ |
| Camera scanning | `main.tsx` + `expo-camera` | ✅ |
| Gallery upload | `main.tsx` + `expo-image-picker` | ✅ |
| OMR processing | `Backend/scan.py` via `server.js` | ✅ |
| Detailed results | `main.tsx` | ✅ |
| Candidate index detection | `scan.py` | ✅ |
| Local analytics | `main.tsx` + AsyncStorage | ✅ |
| CSV export | `main.tsx` | ✅ |
| User authentication | — | ❌ |
| Cloud database | — | ❌ |
| Automated tests | — | ❌ |

### Technologies

| Layer | Tech | Why |
|-------|------|-----|
| Mobile | React Native + Expo 53 + TypeScript | Cross-platform, camera APIs |
| Routing | Expo Router | File-based navigation |
| HTTP | Axios | Multipart image upload |
| Local storage | AsyncStorage | Simple device persistence |
| API server | Node.js + Express + Multer | Upload handling, Python bridge |
| Processing | Python + OpenCV + NumPy | Industry-standard CV for OMR |

### Important Limitations (say these honestly)
- Backend URL hardcoded: `http://192.168.0.114:3000` — same Wi-Fi required
- No authentication on API
- No server database — results only on device
- Landing page says "AI-powered" and "99% accuracy" — implementation uses **classical CV, not ML**, and accuracy is not measured in code
- Answer sheet layout must match the fixed 20×20 grid design

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              MOBILE APP (Expo / React Native)                │
│  index.tsx (Landing)  →  main.tsx (Setup / Camera / Results) │
│                              ↓ AsyncStorage                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ POST /process-image (multipart)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           BACKEND (Node.js Express — server.js)              │
│  Validate → save temp file → spawn Python → return JSON       │
└──────────────────────────────┬──────────────────────────────┘
                               │ spawn("python", ["scan.py", ...])
                               ▼
┌─────────────────────────────────────────────────────────────┐
│         PROCESSING ENGINE (Python — scan.py)                 │
│  Detect sheet → warp → threshold → read bubbles → grade      │
└─────────────────────────────────────────────────────────────┘
```

**Verbal summary:** Phone captures sheet → Express receives upload → Python OpenCV grades → JSON back to app → saved locally.

---

## 3. How the System Works (End-to-End)

### Simple flow
1. Teacher opens app and configures exam (questions + answer key)
2. Teacher scans sheet with camera OR uploads from gallery
3. App preprocesses image (4:3 crop, 800×600 resize)
4. App sends image + config to backend
5. Python detects sheet, reads bubbles, grades
6. App shows score, grade, detailed breakdown
7. Result auto-saved to AsyncStorage; available in Analysis

### Technical flow

```
main.tsx: startScanning()
  → openCamera() OR pickImageFromGallery()
  → enforceAspectRatio() → 800×600 JPEG
  → processImage()
      FormData: { image, questions, answers: JSON [0,1,2,...] }
      POST http://192.168.0.114:3000/process-image

server.js:
  → multer saves to uploads/
  → validate questions (1-60) and answers array
  → spawn python scan.py <path> <count> <answers_json>
  → parse stdout JSON → convert image to data URL
  → cleanup temp file → res.json(result)

main.tsx:
  → setResult(response.data)
  → saveResult() → AsyncStorage "examResults"
  → show brief overlay + optional detailed modal
```

### Answer key encoding
Frontend converts letters to indices before sending:
- A → 0, B → 1, C → 2, D → 3, E → 4

Example: answer key `"ABCDE"` becomes `[0, 1, 2, 3, 4]`

---

## 4. scan.py — Detailed Algorithm Walkthrough

**File:** `Backend/scan.py`  
**Role:** Core OMR engine — called by `server.js` as a subprocess  
**Input (CLI args):**
1. `sys.argv[1]` — path to uploaded image
2. `sys.argv[2]` — number of questions (1–60)
3. `sys.argv[3]` — JSON string of correct answer indices, e.g. `[0,1,2,0,1]`

**Output:** JSON printed to **stdout** (Node reads this)

---

### Phase 0: Input Validation

```python
path = sys.argv[1]
no_questions = int(sys.argv[2])
ans = json.loads(sys.argv[3])  # correct answer key as 0-4 indices
```

| Check | Failure response |
|-------|-----------------|
| Missing args | `{"error": "BMissing arguments"}` |
| Questions not 1–60 | `{"error": "BNumber must be between 1 and 60"}` |
| Answers not a list or wrong length | `{"error": "BInvalid answers format"}` |
| Image unreadable | Exception caught, error JSON returned |

**Why resize first?** All images are normalized to **700×700** so contour detection behaves consistently regardless of original camera resolution.

---

### Phase 1: Image Preprocessing

```python
img = cv2.imread(path)
img = cv2.resize(img, (700, 700))
img_orig = img.copy()
imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
imgBlur = cv2.GaussianBlur(imgGray, (5, 5), 1)
imgCanny = cv2.Canny(imgBlur, 10, 70)
```

| Step | Function | Purpose |
|------|----------|---------|
| Load | `cv2.imread` | Read uploaded JPEG/PNG |
| Resize | `cv2.resize(700,700)` | Normalize dimensions |
| Grayscale | `cvtColor BGR2GRAY` | Single channel for edge detection |
| Blur | `GaussianBlur(5,5)` | Reduce noise before edge detection |
| Edge detect | `Canny(10, 70)` | Find sheet borders and bubble edges |

**Simple explanation:** Convert to grayscale, smooth noise, then find edges so we can locate the rectangular answer sheet.

**Defense tip:** Canny uses two thresholds (10 low, 70 high). Low threshold catches weak edges; high threshold keeps strong edges only.

---

### Phase 2: Find the Answer Sheet (Contour Detection)

```python
contours, _ = cv2.findContours(imgCanny, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
```

Then `rectContour()` filters contours:

```python
def rectContour(contours):
    for i in contours:
        area = cv2.contourArea(i)
        if area > 50:
            approx = cv2.approxPolyDP(i, 0.02 * peri, True)
            if len(approx) == 4:   # quadrilateral = rectangle candidate
                rectCon.append(i)
    return sorted(rectCon, key=cv2.contourArea, reverse=True)
```

| Step | What it does |
|------|-------------|
| `findContours` | Gets all closed shapes from edge image |
| Area filter `> 50` | Ignores tiny noise contours |
| `approxPolyDP` | Simplifies contour to polygon |
| `len(approx) == 4` | Keeps only 4-sided shapes (rectangles) |
| Sort by area | Largest rectangle = main answer sheet |

**Failure:** If no rectangles found → error: *"No answer sheet detected"*

**Minimum area check:** Largest contour must have area ≥ **50,000** pixels. If too small, processing stops (sheet too far away or not visible enough).

---

### Phase 3: Corner Ordering

Detected corners come in arbitrary order. `reorder()` sorts them consistently:

```python
def reorder(myPoints):
    add = myPoints.sum(1)
    myPointsNew[0] = myPoints[np.argmin(add)]   # Top-left (smallest x+y)
    myPointsNew[3] = myPoints[np.argmax(add)]   # Bottom-right (largest x+y)
    diff = np.diff(myPoints, axis=1)
    myPointsNew[1] = myPoints[np.argmin(diff)]  # Top-right
    myPointsNew[2] = myPoints[np.argmax(diff)]  # Bottom-left
```

**Order:** `[Top-Left, Top-Right, Bottom-Left, Bottom-Right]`

**Why needed?** Perspective transform requires corners in a fixed order. Without reordering, the warped image would be rotated or flipped.

---

### Phase 4: Perspective Transform (Bird's-Eye View)

```python
pts1 = np.float32(biggestContour)  # 4 corners in original image
pts2 = np.float32([[0,0], [700,0], [0,700], [700,700]])  # destination rectangle
matrix = cv2.getPerspectiveTransform(pts1, pts2)
imgWarpColored = cv2.warpPerspective(img, matrix, (700, 700))
```

**Simple explanation:** Even if the photo is taken at an angle, this "flattens" the sheet into a perfect top-down 700×700 view — like scanning a document.

**Visualization:** Corner markers (TL/TR/BL/BR shapes) are drawn on `img_with_corners` for the result image.

---

### Phase 5: Thresholding (Bubble Detection Prep)

```python
imgWarpGray = cv2.cvtColor(imgWarpColored, cv2.COLOR_BGR2GRAY)
imgThresh = cv2.adaptiveThreshold(
    imgWarpGray, 255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV,
    199, 20
)
```

| Parameter | Meaning |
|-----------|---------|
| `ADAPTIVE_THRESH_GAUSSIAN_C` | Threshold computed locally per region (handles uneven lighting) |
| `THRESH_BINARY_INV` | Filled/dark marks become **white (255)**, background black |
| Block size `199` | Large neighborhood for threshold calculation |
| Constant `20` | Subtracted from local mean |

**Simple explanation:** Converts the warped sheet so filled bubbles appear as white pixels on black background. Adaptive threshold handles shadows better than a single global threshold.

---

### Phase 6: Grid Splitting

```python
def splitBoxes(img, grid_rows=20, grid_cols=20):
    rows_split = np.vsplit(img, 20)
    for row in rows_split:
        cols_split = np.hsplit(row, 20)
        boxes.append(cols_split)
```

The warped 700×700 image is divided into a **20 rows × 20 columns** grid.

Each cell = one potential bubble region.

Cell size: `700/20 = 35×35` pixels per cell.

---

### Phase 7: Question-to-Grid Mapping

The answer sheet supports up to **60 questions** in **3 blocks of 20**:

| Questions | Grid Row | Grid Columns (options A–E) |
|-----------|----------|----------------------------|
| Q1 – Q20  | row = q  | columns 1–5 (offset = 1)   |
| Q21 – Q40 | row = q-20 | columns 8–12 (offset = 8) |
| Q41 – Q60 | row = q-40 | columns 15–19 (offset = 15) |

```python
for q in range(no_questions):
    if q < 20:
        row, offset = q, 1
    elif q < 40:
        row, offset = q - 20, 8
    else:
        row, offset = q - 40, 15

    for i, c in enumerate(range(offset, offset + 5)):
        box = boxes[row][c]
        myPixelVal[q][i] = cv2.countNonZero(box) / float(box.size)
```

**How bubble selection works:**
1. For each question, look at 5 grid cells (A through E)
2. Count white (filled) pixels in each cell
3. Divide by total cell size → **fill ratio** (0.0 to 1.0)
4. `np.argmax(row)` → option with highest fill ratio = student's answer

**Example:** Q1 uses row 0, columns 1–5. If column 3 has the most white pixels, student answered **C** (index 2).

---

### Phase 8: Grading

```python
myIndex = [np.argmax(row) for row in myPixelVal]   # detected answers (0-4)
grading = [1 if ans[q] == myIndex[q] else 0 for q in range(no_questions)]
score = sum(grading)
```

| Output | Description |
|--------|-------------|
| `myIndex` | Detected student answers as indices |
| `grading` | `[1,0,1,...]` — 1=correct, 0=wrong |
| `score` | Total correct count |

Letters for display: `chr(index + 65)` → 0='A', 1='B', etc.

Debug summary is also printed to **stderr** (visible in backend terminal, not sent to app).

---

### Phase 9: Quality Validation

```python
total_detected = sum([1 for row in myPixelVal if np.max(row) > 0.01])
if total_detected < no_questions * 0.5:
    return error  # "Insufficient answer markings detected"
```

**Rule:** At least **50%** of questions must show detectable marks (max fill ratio > 1% per question).

**Why:** Prevents grading blank or random images that happen to have a detected rectangle.

---

### Phase 10: Result Visualization

A blank image `imgVisualization` is created. For each question:

```python
# Small green circle = correct answer position
cv2.circle(imgVisualization, (x_correct, y_pos), 7, (0, 255, 0), -1)

# Larger circle at student's detected answer
# Green if correct, Red if wrong
color = (0, 255, 0) if grading[q] == 1 else (0, 0, 255)
cv2.circle(imgVisualization, (x_student, y_pos), 10, color, -1)
```

Then **inverse perspective transform** maps markers back onto the original photo angle:

```python
invMatrix = cv2.getPerspectiveTransform(pts2, pts1)
imgInvWarp = cv2.warpPerspective(imgVisualization, invMatrix, (700, 700))
imgFinal = cv2.addWeighted(img_orig, 1, imgInvWarp, 0.7, 0)
```

Teacher sees green/red dots overlaid on the actual photographed sheet.

---

### Phase 11: Candidate Index Number Detection

Uses the **second-largest rectangle** on the sheet (student ID / index number grid):

```python
if len(rectCons) > 1:
    secondContour = reorder(getCornerPoints(rectCons[1]))
    # Perspective warp second region
    imgWarpNum = cv2.warpPerspective(img, matrix_num, (700, 700))
    imgWarpNumResized = cv2.resize(imgWarpNum, (480, 520))  # 12 cols × 13 rows
```

Grid: **12 columns × 13 rows** (each column = one digit, 0–9 in rows 3–12)

```python
for col in range(12):
    for row in range(3, 13):   # rows 3-12 = digits 0-9
        pixel_val = cv2.countNonZero(box)
        # pick row with most filled pixels
        digit = row - 3
    candidate_digits.append(str(digit))

candidate_number = "".join(candidate_digits)  # e.g. "123456789012"
```

Green circles mark detected digits; warped back onto original image via inverse transform.

**Limitation:** Only works if a second distinct rectangle is detected on the sheet.

---

### Phase 12: Output Assembly

```python
img_corners_small = cv2.resize(img_with_corners, (350, 350))  # detection view
img_final_small = cv2.resize(imgFinal, (350, 350))            # graded view
img_combined = np.hstack((img_corners_small, img_final_small)) # side by side
```

**Final JSON (stdout):**

```json
{
  "score": 15,
  "correct": 15,
  "total": 20,
  "grading": [1, 0, 1, ...],
  "student_answers": ["A", "C", "B", ...],
  "correct_answers": ["A", "B", "B", ...],
  "image": "<base64 JPEG>",
  "image_type": "jpg",
  "candidate_number": "123456789012"
}
```

Node.js converts base64 to `data:image/jpg;base64,...` before sending to the app.

---

### scan.py — Visual Pipeline Summary

```
Original Photo
    ↓ resize 700×700
Grayscale → Blur → Canny edges
    ↓ findContours
Filter 4-sided rectangles → sort by area
    ↓ largest = answer sheet
Reorder corners → perspective warp
    ↓ bird's-eye 700×700
Adaptive threshold (bubbles = white)
    ↓ split 20×20 grid
For each question: count pixels in 5 cells → argmax
    ↓ compare to answer key
Score + grading + visualization overlay
    ↓ (optional) second contour → index number
Combine images → base64 → JSON stdout
```

---

### Common Examiner Questions on scan.py

**Q: Why adaptive threshold instead of fixed threshold?**  
A: Classroom photos have uneven lighting. Adaptive threshold computes a local threshold per region, so bubbles in shadow are still detected.

**Q: Why argmax on pixel count instead of ML?**  
A: The answer sheet has a fixed, known layout. Counting filled pixels in predefined cells is deterministic, explainable, and doesn't require training data.

**Q: What if a student marks two bubbles?**  
A: The algorithm picks whichever cell has the **highest fill ratio**. If both are heavily marked, the darker one wins — ambiguous marks are a known OMR limitation.

**Q: What if the sheet is at a steep angle?**  
A: Perspective transform corrects for angle **if** all four corners are detected. Extreme angles or cropped corners may fail contour detection.

**Q: Why 700×700?**  
A: Fixed size normalizes input so grid cell dimensions and area thresholds (50,000 min area) remain consistent.

---

## 5. Feature Breakdown

| Feature | Key File | Key Functions |
|---------|----------|---------------|
| Landing page | `index.tsx` | `onGetStarted()`, `downloadSheets()` |
| Exam setup | `main.tsx` | `renderSetup()`, `startScanning()` |
| Answer key input | `main.tsx` | `renderAnswerKeyInputs()` |
| Camera scan | `main.tsx` | `openCamera()`, `takePicture()`, `renderCamera()` |
| Gallery upload | `main.tsx` | `pickImageFromGallery()` |
| Image prep | `main.tsx` | `enforceAspectRatio()` |
| API call | `main.tsx` | `processImage()` |
| Results display | `main.tsx` | `renderBriefResults()`, `renderDetailedResults()` |
| Save results | `main.tsx` | `saveResult()`, `loadStoredResults()` |
| Analytics | `main.tsx` | `generateAnalysis()`, `renderAnalysisModal()` |
| CSV export | `main.tsx` | `saveAnalysisToDevice()` |
| API gateway | `server.js` | `POST /process-image`, `cleanup()` |
| OMR engine | `scan.py` | `main()` |

### Unused / prototype files (know these!)
- `Backend/omr_grading.py` — early prototype, hardcoded answers
- `Backend/process.py` — standalone CLI experiment
- `Backend/example.py` — incomplete debug version
- `opencv-ts` in package.json — **not used** in frontend

---

## 6. Data Storage

**No server database.**

### AsyncStorage
- **Key:** `"examResults"`
- **Value:** JSON array of exam result objects

```typescript
interface StoredExamResult {
  id: string;
  timestamp: number;
  score: number;
  correct: number;
  total: number;
  percentage: number;
  grade: string;           // A-F
  grading: boolean[];
  image: string;           // base64 data URI
  candidate_number?: string;
}
```

### Grade scale (`calculateGrade()`)
| Grade | Percentage |
|-------|-----------|
| A | ≥ 80% |
| B | ≥ 70% |
| C | ≥ 60% |
| D | ≥ 50% |
| E | ≥ 40% (pass threshold) |
| F | < 40% |

---

## 7. Authentication & Security

| Area | Status |
|------|--------|
| User login | ❌ Not implemented |
| API authentication | ❌ Open endpoint |
| HTTPS | ❌ HTTP only, hardcoded IP |
| CORS | ✅ Enabled for all origins |
| Input validation | ✅ Client + server (question count, answers) |
| Temp file cleanup | ✅ Deleted after processing |
| Rate limiting | ❌ None |

**Honest defense answer:** "Security was out of scope for the prototype. Production would need HTTPS, authentication, and rate limiting."

---

## 8. API Reference

### `POST /process-image`

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `image` | File | JPEG answer sheet |
| `questions` | string | "1" to "60" |
| `answers` | string | JSON array, e.g. `"[0,1,2,0,1]"` |

**Success response (200):**
```json
{
  "score": 15,
  "correct": 15,
  "total": 20,
  "grading": [1,0,1,...],
  "student_answers": ["A","B",...],
  "correct_answers": ["A","C",...],
  "image": "data:image/jpg;base64,...",
  "candidate_number": "123456789012"
}
```

**Error responses:** 400 (validation), 500 (Python failure)

---

## 9. Frontend Architecture

- **Framework:** React Native 0.79 + Expo 53 + TypeScript
- **Routing:** Expo Router — `(home)/index` → `(home)/main`
- **State:** React `useState` / `useEffect` in `main.tsx` (no Redux)
- **Backend URL:** `const BACKEND_URL = "http://192.168.0.114:3000"` (line 98)

### Key screens
1. **Landing** (`index.tsx`) — features, download sheets, get started
2. **Setup** (`main.tsx`) — questions, answer key, scan mode, analysis
3. **Camera modal** — live capture with guide overlay
4. **Upload modal** — gallery processing with loading state
5. **Results overlay** — brief score + detailed modal
6. **Analysis modal** — stats, search, CSV export

---

## 10. Backend Architecture

**File:** `Backend/server.js` (~96 lines)

Node.js role: **API gateway only** — all business logic is in Python.

```
Request → multer (save uploads/) → validate → spawn scan.py
         → read stdout → parse JSON → cleanup file → respond
```

Python dependencies (not in repo — install manually):
```
opencv-python
numpy
```

---

## 11. User Journeys

### Journey 1: First scan
Landing → Get Started → Enter 20 questions + key → Camera Mode → Capture → Processing → Score shown → Auto-saved

### Journey 2: Class marking session
Setup exam → Upload Mode for each sheet → View Analysis → Export CSV

### Journey 3: Failure
Bad image → scan.py no contour → Error alert → Scan Again

### Journey 4: Duplicate index
Same candidate_number scanned twice → Alert: Discard or Save Anyway

---

## 12. Technical Decisions

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| Mobile framework | Expo/RN | Native, Flutter | Camera APIs, cross-platform |
| Processing location | Server Python | On-device, cloud API | Full OpenCV, easier debugging |
| Detection method | Classical CV | ML/CNN | Fixed layout, no training data needed |
| Storage | AsyncStorage | MySQL, Firebase | Prototype scope, no backend DB |
| Grid design | Fixed 20×20 | Dynamic template | Matches printable sheet layout |

---

## 13. Testing

**Implemented:** Manual testing only  
**Not implemented:** Unit tests, integration tests, CI

| Test Case | Expected | Status |
|-----------|----------|--------|
| Valid sheet + correct key | Score returned | Manual |
| Invalid question count (0, 61) | 400 error | ✅ |
| Invalid answer key | Client alert | ✅ |
| No sheet in image | Error message | ✅ |
| Backend offline | Axios error alert | ✅ |
| Duplicate candidate number | Warning dialog | ✅ |
| Clear all results | Storage emptied | ✅ |

---

## 14. Strengths, Weaknesses & Future Work

### Strengths
- Complete end-to-end OMR pipeline with visualization
- Candidate index number detection
- Local analytics + CSV export
- Explainable classical CV algorithm
- Practical teacher-focused UX

### Weaknesses
- No auth, no cloud, hardcoded IP
- "AI-powered" / "99% accuracy" claims unsupported
- No automated tests
- Fixed sheet layout only
- Base64 images bloat AsyncStorage

### Future improvements
- Environment-based API URL
- Cloud deployment + PostgreSQL/Firebase
- JWT authentication
- Automated pytest/Jest tests
- Configurable sheet templates
- On-device processing option

---

## 15. Defense Cheat Sheet

| Item | Value |
|------|-------|
| Problem | Manual MCQ grading is slow |
| Solution | Mobile OMR with OpenCV |
| Stack | Expo + Express + Python OpenCV |
| Main API | POST /process-image |
| Core algorithm | Contour → warp → grid → pixel argmax |
| Max questions | 60 (3 blocks of 20) |
| Choices | A–E |
| Storage | AsyncStorage key `examResults` |
| Auth | None |
| Key files | main.tsx, server.js, scan.py |
| Biggest weakness | Local network + no auth |

---

## 16. Top 20 Exam Questions

1. **What is the project?** → Mobile OMR MCQ auto-grader
2. **What problem?** → Manual grading slow/error-prone for teachers
3. **Tech stack?** → Expo, Express, Python OpenCV
4. **Architecture?** → Mobile → Express → Python → JSON back
5. **Main API?** → POST /process-image (multipart)
6. **Database?** → AsyncStorage on device, no server DB
7. **Authentication?** → None (limitation)
8. **How are bubbles detected?** → 20×20 grid + countNonZero + argmax
9. **How is sheet found?** → Canny edges + largest 4-sided contour
10. **Perspective correction?** → getPerspectiveTransform + warpPerspective
11. **Why adaptive threshold?** → Handles uneven lighting in photos
12. **Max questions?** → 60 in 3 columns of 20
13. **Candidate number?** → Second-largest contour, 12×13 digit grid
14. **Where results stored?** → AsyncStorage on phone
15. **Why OpenCV not ML?** → Fixed layout, explainable, no training data
16. **Why not MySQL?** → Prototype scope, local storage sufficient
17. **Biggest weakness?** → Hardcoded IP, no auth, needs local server
18. **Testing?** → Manual only
19. **Is it AI?** → Classical computer vision, not machine learning
20. **Future work?** → Cloud, auth, DB, tests, env config

---

*Generated from codebase analysis of the MCQ Marker final year project.*
