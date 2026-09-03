"""
MCQ Marker — OMR (Optical Mark Recognition) grading engine.

Called by server.js as a subprocess:
    python scan.py <image_path> <question_count> <answers_json>

Arguments:
    image_path     — path to uploaded answer sheet image
    question_count — number of questions (1–60)
    answers_json   — JSON array of correct answers as indices (A=0, B=1, ..., E=4)
                     Example: "[0,1,2,0,1]" for answers A,B,C,A,B

Output:
    Success → JSON to stdout (score, grading, student answers, base64 image, etc.)
    Debug   → summary JSON to stderr (visible in backend terminal)
    Failure → JSON with "error" key to stdout
"""

import cv2
import numpy as np
import sys
import json
import base64
import traceback


def image_to_base64(img):
    """Encode an OpenCV BGR image as a base64 JPEG string for the API response."""
    _, buffer = cv2.imencode(".jpg", img)
    return base64.b64encode(buffer).decode("utf-8")


def draw_corner_markers(img, corners, color=(0, 255, 255), size=20):
    """
    Draw labeled corner markers on the detection preview image.
    Each corner gets a unique shape so you can verify reorder() worked:
      0 = Top-left (circle), 1 = Top-right (square),
      2 = Bottom-left (triangle), 3 = Bottom-right (diamond)
    """
    for i, corner in enumerate(corners):
        x, y = int(corner[0][0]), int(corner[0][1])

        if i == 0:  # Top-left — circle
            cv2.circle(img, (x, y), size, color, -1)
            cv2.circle(img, (x, y), size + 5, (255, 255, 255), 3)
            cv2.putText(
                img, "TL", (x - 15, y - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )
        elif i == 1:  # Top-right — square
            cv2.rectangle(img, (x - size, y - size), (x + size, y + size), color, -1)
            cv2.rectangle(
                img,
                (x - size - 5, y - size - 5),
                (x + size + 5, y + size + 5),
                (255, 255, 255),
                3,
            )
            cv2.putText(
                img, "TR", (x - 15, y - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )
        elif i == 2:  # Bottom-left — triangle
            pts = np.array(
                [[x, y - size], [x - size, y + size], [x + size, y + size]], np.int32
            )
            cv2.fillPoly(img, [pts], color)
            cv2.polylines(img, [pts], True, (255, 255, 255), 3)
            cv2.putText(
                img, "BL", (x - 15, y + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )
        elif i == 3:  # Bottom-right — diamond
            pts = np.array(
                [[x, y - size], [x + size, y], [x, y + size], [x - size, y]], np.int32
            )
            cv2.fillPoly(img, [pts], color)
            cv2.polylines(img, [pts], True, (255, 255, 255), 3)
            cv2.putText(
                img, "BR", (x - 15, y + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )


def main():
    try:
        # ------------------------------------------------------------------
        # PHASE 0: Read and validate CLI arguments from server.js
        # ------------------------------------------------------------------
        if len(sys.argv) < 4:
            print(json.dumps({"error": "BMissing arguments"}))
            return

        path = sys.argv[1]           # temp upload path from Multer
        no_questions = int(sys.argv[2])

        if no_questions > 60 or no_questions <= 0:
            print(json.dumps({"error": "BNumber must be between 1 and 60"}))
            return

        # Fixed processing dimensions — all sheets normalized to this size
        widthImg = 700
        heightImg = 700
        choices = 5  # options A through E

        # Answer key from teacher: list of ints 0–4 (frontend converts A→0, B→1, etc.)
        ans = json.loads(sys.argv[3])

        if not isinstance(ans, list) or len(ans) != no_questions:
            print(json.dumps({"error": "BInvalid answers format"}))
            return

        # ------------------------------------------------------------------
        # PHASE 1: Load image and prepare for edge detection
        # Goal: find the rectangular border of the answer sheet
        # ------------------------------------------------------------------
        img = cv2.imread(path)
        if img is None:
            raise Exception("BCould not read image file")

        img = cv2.resize(img, (widthImg, heightImg))
        img_orig = img.copy()  # kept for final overlay on original photo angle

        imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        imgBlur = cv2.GaussianBlur(imgGray, (5, 5), 1)  # reduce noise
        imgCanny = cv2.Canny(imgBlur, 10, 70)             # edge map

        # ------------------------------------------------------------------
        # PHASE 2: Find rectangular contours (answer sheet candidates)
        # ------------------------------------------------------------------
        contours, _ = cv2.findContours(
            imgCanny, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        def rectContour(contours):
            """
            Filter contours down to 4-sided polygons (rectangles).
            Returns list sorted largest-first — [0] is main answer block,
            [1] is typically the candidate index number block.
            """
            rectCon = []
            for i in contours:
                area = cv2.contourArea(i)
                if area > 50:  # ignore tiny noise blobs
                    peri = cv2.arcLength(i, True)
                    approx = cv2.approxPolyDP(i, 0.02 * peri, True)
                    if len(approx) == 4:
                        rectCon.append(i)
            return sorted(rectCon, key=cv2.contourArea, reverse=True)

        rectCon = rectContour(contours)
        if not rectCon:
            print(
                json.dumps(
                    {
                        "error": "BNo answer sheet detected. Please ensure the image contains a clear, well-lit answer sheet with visible borders."
                    }
                )
            )
            return

        def getCornerPoints(cont):
            """Approximate a contour to its 4 corner points."""
            peri = cv2.arcLength(cont, True)
            return cv2.approxPolyDP(cont, 0.02 * peri, True)

        biggestContour = getCornerPoints(rectCon[0])

        area_biggest = cv2.contourArea(rectContour(contours)[0])

        # Reject sheets that are too small in frame (too far away / cropped)
        MIN_BIGGEST_AREA = 50000
        if area_biggest < MIN_BIGGEST_AREA:
            print(
                json.dumps(
                    {
                        "Warning: BBiggest contour area is less than the required minimum."
                    }
                )
            )
            return

        if biggestContour.size == 0:
            print(
                json.dumps(
                    {
                        "error": "BCould not detect answer sheet corners. Please ensure the answer sheet is clearly visible and not too blurry."
                    }
                )
            )
            return

        # ------------------------------------------------------------------
        # PHASE 3: Order corners consistently for perspective warp
        # Output order: [Top-Left, Top-Right, Bottom-Left, Bottom-Right]
        # ------------------------------------------------------------------
        def reorder(myPoints):
            """
            OpenCV returns corners in arbitrary order. This sorts them using:
              - smallest (x+y) → top-left
              - largest (x+y)  → bottom-right
              - smallest (x-y) → top-right
              - largest (x-y)  → bottom-left
            """
            myPoints = myPoints.reshape((4, 2))
            myPointsNew = np.zeros((4, 1, 2), np.int32)
            add = myPoints.sum(1)
            myPointsNew[0] = myPoints[np.argmin(add)]
            myPointsNew[3] = myPoints[np.argmax(add)]
            diff = np.diff(myPoints, axis=1)
            myPointsNew[1] = myPoints[np.argmin(diff)]
            myPointsNew[2] = myPoints[np.argmax(diff)]
            return myPointsNew

        biggestContour = reorder(biggestContour)

        # Build left-side preview image: corner markers + sheet outline
        img_with_corners = img_orig.copy()
        draw_corner_markers(
            img_with_corners, biggestContour, color=(0, 255, 255), size=15
        )
        cv2.drawContours(img_with_corners, [biggestContour], -1, (0, 255, 0), 3)

        # Second-largest rectangle = candidate index number region (if present)
        rectCons = rectContour(contours)
        imgNumInvWarp = np.zeros_like(img_orig)
        if len(rectCons) > 1:
            secondContour = getCornerPoints(rectCons[1])
            if secondContour.size != 0:
                secondContour = reorder(secondContour)
                cv2.drawContours(
                    img_with_corners, [secondContour], -1, (255, 0, 255), 3
                )

        # ------------------------------------------------------------------
        # PHASE 4: Perspective transform — flatten angled photo to top-down view
        # Maps the 4 detected corners → perfect 700×700 rectangle
        # ------------------------------------------------------------------
        pts1 = np.float32(biggestContour)
        pts2 = np.float32(
            [[0, 0], [widthImg, 0], [0, heightImg], [widthImg, heightImg]]
        )
        matrix = cv2.getPerspectiveTransform(pts1, pts2)
        imgWarpColored = cv2.warpPerspective(img, matrix, (widthImg, heightImg))

        # ------------------------------------------------------------------
        # PHASE 5: Threshold — turn filled bubbles into white pixels on black
        # Adaptive threshold handles uneven lighting better than a fixed value
        # ------------------------------------------------------------------
        imgWarpGray = cv2.cvtColor(imgWarpColored, cv2.COLOR_BGR2GRAY)
        imgThresh = cv2.adaptiveThreshold(
            imgWarpGray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,  # marks = white (255), paper = black (0)
            199,
            20,
        )

        # ------------------------------------------------------------------
        # PHASE 6: Split warped sheet into a 20×20 grid of bubble cells
        # Each cell is 35×35 px (700 / 20)
        # ------------------------------------------------------------------
        def splitBoxes(img, grid_rows=20, grid_cols=20):
            """Return 2D list boxes[row][col] plus cell width/height."""
            cell_h = img.shape[0] // grid_rows
            cell_w = img.shape[1] // grid_cols
            boxes = []
            rows_split = np.vsplit(img, grid_rows)
            for row in rows_split:
                cols_split = np.hsplit(row, grid_cols)
                boxes.append(cols_split)
            return boxes, cell_w, cell_h

        boxes, cell_w, cell_h = splitBoxes(imgThresh)

        # ------------------------------------------------------------------
        # PHASE 7: Read student answers — count filled pixels per bubble
        #
        # Sheet layout (up to 60 questions in 3 blocks of 20):
        #   Q1–Q20:  row = q,       columns 1–5   (offset 1)
        #   Q21–Q40: row = q - 20,  columns 8–12  (offset 8)
        #   Q41–Q60: row = q - 40,  columns 15–19 (offset 15)
        #
        # For each question, the option with highest fill ratio wins (argmax).
        # ------------------------------------------------------------------
        myPixelVal = np.zeros((no_questions, choices))
        for q in range(no_questions):
            if q < 20:
                row = q
                offset = 1
            elif q < 40:
                row = q - 20
                offset = 8
            else:
                row = q - 40
                offset = 15

            for i, c in enumerate(range(offset, offset + 5)):
                box = boxes[row][c]
                # fill ratio: 0.0 = empty, higher = more ink in bubble
                myPixelVal[q][i] = cv2.countNonZero(box) / float(box.size)

        # ------------------------------------------------------------------
        # PHASE 8: Grade — compare detected answers to teacher's answer key
        # myIndex[q] = student's choice (0–4), ans[q] = correct choice (0–4)
        # ------------------------------------------------------------------
        myIndex = [np.argmax(row) for row in myPixelVal]
        grading = [1 if ans[q] == myIndex[q] else 0 for q in range(no_questions)]
        score = sum(grading)

        # Debug log for backend terminal (stderr — not sent to mobile app)
        student_letters = [chr(int(i) + 65) for i in myIndex]
        correct_letters = [chr(int(a) + 65) for a in ans]
        debug_payload = {
            "debug": "scan_result_summary",
            "question_count": no_questions,
            "correct_answers": correct_letters,
            "student_answers": student_letters,
            "grading": grading,
            "score": int(score),
            "correct": int(sum(grading)),
            "total": no_questions,
        }
        print(json.dumps(debug_payload), file=sys.stderr)
        sys.stderr.flush()

        # ------------------------------------------------------------------
        # PHASE 9: Quality check — reject mostly blank / invalid scans
        # Require detectable marks on at least 50% of questions
        # ------------------------------------------------------------------
        total_detected = sum(
            [1 for row in myPixelVal if np.max(row) > 0.01]
        )
        if total_detected < no_questions * 0.5:
            print(
                json.dumps(
                    {
                        "error": "BInsufficient answer markings detected. Please ensure the answer sheet has clear, dark markings and good contrast."
                    }
                )
            )
            return

        # ------------------------------------------------------------------
        # PHASE 10: Draw grading overlay on warped sheet, then warp back
        # Green dot = correct answer key position (small)
        # Green/red dot = student's detected answer (large)
        # ------------------------------------------------------------------
        imgVisualization = np.zeros_like(imgWarpColored)

        for q in range(no_questions):
            if q < 20:
                row = q
                offset = 1
            elif q < 40:
                row = q - 20
                offset = 8
            else:
                row = q - 40
                offset = 15

            x_correct = int((offset + ans[q] + 0.5) * cell_w)
            y_pos = int((row + 0.5) * cell_h)
            cv2.circle(imgVisualization, (x_correct, y_pos), 7, (0, 255, 0), -1)

            x_student = int((offset + myIndex[q] + 0.5) * cell_w)
            color = (0, 255, 0) if grading[q] == 1 else (0, 0, 255)
            cv2.circle(imgVisualization, (x_student, y_pos), 10, color, -1)

        # Inverse warp: overlay dots back onto the original photo angle
        invMatrix = cv2.getPerspectiveTransform(pts2, pts1)
        imgInvWarp = cv2.warpPerspective(
            imgVisualization, invMatrix, (widthImg, heightImg)
        )
        imgFinal = cv2.addWeighted(img_orig, 1, imgInvWarp, 0.7, 0)

        # ------------------------------------------------------------------
        # PHASE 11: Candidate index number (second-largest rectangle)
        # 12 columns = 12 digits, rows 3–12 = digits 0–9 (bubble column per digit)
        # ------------------------------------------------------------------
        candidate_number = None
        if len(rectCons) > 1:
            secondContour = getCornerPoints(rectCons[1])
            if secondContour.size != 0:
                secondContour = reorder(secondContour)
                pts1_num = np.float32(secondContour)
                pts2_num = np.float32(
                    [
                        [0, 0],
                        [widthImg, 0],
                        [0, heightImg],
                        [widthImg, heightImg],
                    ]
                )
                matrix_num = cv2.getPerspectiveTransform(pts1_num, pts2_num)
                imgWarpNum = cv2.warpPerspective(img, matrix_num, (widthImg, heightImg))

                num_rows, num_cols = 13, 12
                fixed_w, fixed_h = 480, 520
                imgWarpNumResized = cv2.resize(imgWarpNum, (fixed_w, fixed_h))
                imgWarpNumGray = cv2.cvtColor(imgWarpNumResized, cv2.COLOR_BGR2GRAY)
                imgWarpNumBlur = cv2.GaussianBlur(imgWarpNumGray, (5, 5), 1)
                imgNumThresh = cv2.adaptiveThreshold(
                    imgWarpNumBlur,
                    255,
                    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY_INV,
                    199,
                    20,
                )

                boxes_num = []
                rows_split = np.vsplit(imgNumThresh, num_rows)
                for row in rows_split:
                    cols_split = np.hsplit(row, num_cols)
                    boxes_num.append(cols_split)

                candidate_digits = []
                imgNumDraw = np.zeros_like(imgWarpNumResized)
                if len(imgNumDraw.shape) == 2 or (
                    len(imgNumDraw.shape) == 3 and imgNumDraw.shape[2] == 1
                ):
                    imgNumDraw = cv2.cvtColor(imgNumDraw, cv2.COLOR_GRAY2BGR)

                for col in range(num_cols):
                    max_pixel = -1
                    digit = -1
                    # Rows 0–2 are header; rows 3–12 hold digits 0–9
                    for row in range(3, num_rows):
                        box = boxes_num[row][col]
                        pixel_val = cv2.countNonZero(box)
                        if pixel_val > max_pixel:
                            max_pixel = pixel_val
                            digit = row - 3
                    candidate_digits.append(str(digit))

                    box_h = boxes_num[3][col].shape[0]
                    box_w = boxes_num[3][col].shape[1]
                    center_x = int((col + 0.5) * box_w)
                    center_y = int((digit + 3 + 0.5) * box_h)
                    cv2.circle(
                        imgNumDraw,
                        (center_x, center_y),
                        min(box_w, box_h) // 3,
                        (0, 255, 0),
                        cv2.FILLED,
                    )

                candidate_number = "".join(candidate_digits)

                # Warp index-number markers back onto original image
                invMatrixNum = cv2.getPerspectiveTransform(
                    np.float32(
                        [[0, 0], [fixed_w, 0], [0, fixed_h], [fixed_w, fixed_h]]
                    ),
                    pts1_num,
                )
                imgNumInvWarp = cv2.warpPerspective(
                    imgNumDraw, invMatrixNum, (widthImg, heightImg)
                )

        imgFinal = cv2.addWeighted(imgFinal, 1, imgNumInvWarp, 1, 0)

        # ------------------------------------------------------------------
        # PHASE 12: Build response image and print JSON to stdout
        # Left half = corner detection preview, right half = graded overlay
        # server.js reads stdout and forwards JSON to the mobile app
        # ------------------------------------------------------------------
        img_corners_small = cv2.resize(img_with_corners, (350, 350))
        img_final_small = cv2.resize(imgFinal, (350, 350))
        img_combined = np.hstack((img_corners_small, img_final_small))

        student_letters = [chr(int(i) + 65) for i in myIndex]
        correct_letters = [chr(int(a) + 65) for a in ans]

        result = {
            "score": int(score),
            "correct": int(sum(grading)),
            "total": no_questions,
            "grading": grading,
            "student_answers": student_letters,
            "correct_answers": correct_letters,
            "image": image_to_base64(img_combined),
            "image_type": "jpg",
            "candidate_number": candidate_number,
        }
        print(json.dumps(result))
        sys.stdout.flush()

    except Exception as e:
        error_msg = f"Processing failed: {str(e)}. BPlease ensure you're scanning a valid answer sheet with good lighting and clear markings."
        traceback_str = traceback.format_exc()
        print(json.dumps({"error": error_msg, "trace": traceback_str}))
        sys.stdout.flush()
        return


if __name__ == "__main__":
    main()
