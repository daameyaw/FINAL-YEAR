import cv2
import numpy as np
import sys
import json
import base64
import traceback


def image_to_base64(img):
    """Convert OpenCV image to base64 string"""
    _, buffer = cv2.imencode(".jpg", img)
    return base64.b64encode(buffer).decode("utf-8")


def draw_corner_markers(img, corners, color=(0, 255, 255), size=20):
    """Draw corner markers at the specified points"""
    for i, corner in enumerate(corners):
        x, y = int(corner[0][0]), int(corner[0][1])

        # Draw different shapes for each corner for identification
        if i == 0:  # Top-left - Circle
            cv2.circle(img, (x, y), size, color, -1)
            cv2.circle(img, (x, y), size + 5, (255, 255, 255), 3)
            cv2.putText(
                img, "TL", (x - 15, y - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )
        elif i == 1:  # Top-right - Square
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
        elif i == 2:  # Bottom-left - Triangle
            pts = np.array(
                [[x, y - size], [x - size, y + size], [x + size, y + size]], np.int32
            )
            cv2.fillPoly(img, [pts], color)
            cv2.polylines(img, [pts], True, (255, 255, 255), 3)
            cv2.putText(
                img, "BL", (x - 15, y + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )
        elif i == 3:  # Bottom-right - Diamond
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
        # Validate input
        if len(sys.argv) < 4:
            print(json.dumps({"error": "BMissing arguments"}))
            return

        path = sys.argv[1]
        no_questions = int(sys.argv[2])

        if no_questions > 60 or no_questions <= 0:
            print(json.dumps({"error": "BNumber must be between 1 and 60"}))
            return

        # Configuration
        widthImg = 700
        heightImg = 700
        choices = 5

        # Parse the answers array from the JSON string
        ans = json.loads(sys.argv[3])

        if not isinstance(ans, list) or len(ans) != no_questions:
            print(json.dumps({"error": "BInvalid answers format"}))
            return

        # Load image
        img = cv2.imread(path)
        if img is None:
            raise Exception("BCould not read image file")

        # Preprocessing
        img = cv2.resize(img, (widthImg, heightImg))
        img_orig = img.copy()
        imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        imgBlur = cv2.GaussianBlur(imgGray, (5, 5), 1)
        imgCanny = cv2.Canny(imgBlur, 10, 70)

        # Find contours
        contours, _ = cv2.findContours(
            imgCanny, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        # Find rectangle contours
        def rectContour(contours):
            rectCon = []
            for i in contours:
                area = cv2.contourArea(i)
                if area > 50:
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

        # Get corner points
        def getCornerPoints(cont):
            peri = cv2.arcLength(cont, True)
            return cv2.approxPolyDP(cont, 0.02 * peri, True)

        biggestContour = getCornerPoints(rectCon[0])

        area_biggest = cv2.contourArea(rectContour(contours)[0])
        # print("Area of biggest contour:", area_biggest)

        # Ensure the area of the biggest contour is above a certain size
        MIN_BIGGEST_AREA = 50000  # Set your desired minimum area here
        if area_biggest < MIN_BIGGEST_AREA:
            print(
                json.dumps(
                    {
                        "Warning: BBiggest contour area is less than the required minimum."
                    }
                )
            )
            # Optionally, you can exit or handle this case as needed
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

        # Reorder points
        def reorder(myPoints):
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

        # Create a copy of the original image to draw corner markers
        img_with_corners = img_orig.copy()

        # Draw corner markers on the original image
        draw_corner_markers(
            img_with_corners, biggestContour, color=(0, 255, 255), size=15
        )

        # Also draw the contour outline
        cv2.drawContours(img_with_corners, [biggestContour], -1, (0, 255, 0), 3)

        # --- Draw second largest contour region if available ---
        rectCons = rectContour(contours)
        imgNumInvWarp = np.zeros_like(img_orig)  # Default in case not set below
        if len(rectCons) > 1:
            secondContour = getCornerPoints(rectCons[1])
            if secondContour.size != 0:
                secondContour = reorder(secondContour)
                # Draw the second contour outline on the corners image
                cv2.drawContours(
                    img_with_corners, [secondContour], -1, (255, 0, 255), 3
                )

        # Perspective transform
        pts1 = np.float32(biggestContour)
        pts2 = np.float32(
            [[0, 0], [widthImg, 0], [0, heightImg], [widthImg, heightImg]]
        )
        matrix = cv2.getPerspectiveTransform(pts1, pts2)
        imgWarpColored = cv2.warpPerspective(img, matrix, (widthImg, heightImg))

        # Thresholding
        imgWarpGray = cv2.cvtColor(imgWarpColored, cv2.COLOR_BGR2GRAY)
        imgThresh = cv2.adaptiveThreshold(
            imgWarpGray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            199,
            20,
        )

        # Split into boxes
        def splitBoxes(img, grid_rows=20, grid_cols=20):
            cell_h = img.shape[0] // grid_rows
            cell_w = img.shape[1] // grid_cols
            boxes = []
            rows_split = np.vsplit(img, grid_rows)
            for row in rows_split:
                cols_split = np.hsplit(row, grid_cols)
                boxes.append(cols_split)
            return boxes, cell_w, cell_h

        boxes, cell_w, cell_h = splitBoxes(imgThresh)

        # Analyze answers
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
                myPixelVal[q][i] = cv2.countNonZero(box) / float(box.size)

        # Calculate results
        myIndex = [np.argmax(row) for row in myPixelVal]
        grading = [1 if ans[q] == myIndex[q] else 0 for q in range(no_questions)]
        score = sum(grading)

        # Debug values for backend terminal review
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

        # Validate that we detected some answers
        total_detected = sum(
            [1 for row in myPixelVal if np.max(row) > 0.01]
        )  # Threshold for detection
        if (
            total_detected < no_questions * 0.5
        ):  # At least 50% of questions should have detected answers
            print(
                json.dumps(
                    {
                        "error": "BInsufficient answer markings detected. Please ensure the answer sheet has clear, dark markings and good contrast."
                    }
                )
            )
            return

        # Create visualization
        imgVisualization = np.zeros_like(imgWarpColored)

        # Draw answer markers
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

            # Correct answer (small green circle)
            x_correct = int((offset + ans[q] + 0.5) * cell_w)
            y_pos = int((row + 0.5) * cell_h)
            cv2.circle(imgVisualization, (x_correct, y_pos), 7, (0, 255, 0), -1)

            # Student answer (colored circle)
            x_student = int((offset + myIndex[q] + 0.5) * cell_w)
            color = (0, 255, 0) if grading[q] == 1 else (0, 0, 255)
            cv2.circle(imgVisualization, (x_student, y_pos), 10, color, -1)

        # Inverse perspective transform
        invMatrix = cv2.getPerspectiveTransform(pts2, pts1)
        imgInvWarp = cv2.warpPerspective(
            imgVisualization, invMatrix, (widthImg, heightImg)
        )
        imgFinal = cv2.addWeighted(img_orig, 1, imgInvWarp, 0.7, 0)

        # Process the second largest contour for candidate index number
        # (moved rectCons and imgNumInvWarp definition above)
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

                # Force the candidate index region to a fixed size for robust splitting
                num_rows, num_cols = 13, 12
                fixed_w, fixed_h = 480, 520  # 12*40, 13*40 (adjust as needed)
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
                # Now split using np.vsplit and np.hsplit
                boxes_num = []
                rows_split = np.vsplit(imgNumThresh, num_rows)
                for row in rows_split:
                    cols_split = np.hsplit(row, num_cols)
                    boxes_num.append(cols_split)
                # Ignore first 3 rows, process rows 3 to 12 (index 3 to 12)
                candidate_digits = []
                imgNumDraw = np.zeros_like(imgWarpNumResized)
                if len(imgNumDraw.shape) == 2 or (
                    len(imgNumDraw.shape) == 3 and imgNumDraw.shape[2] == 1
                ):
                    imgNumDraw = cv2.cvtColor(imgNumDraw, cv2.COLOR_GRAY2BGR)
                for col in range(num_cols):
                    max_pixel = -1
                    digit = -1
                    for row in range(3, num_rows):
                        box = boxes_num[row][col]
                        pixel_val = cv2.countNonZero(box)
                        if pixel_val > max_pixel:
                            max_pixel = pixel_val
                            digit = (
                                row - 3
                            )  # 0 for row 3, 1 for row 4, ..., 9 for row 12
                    candidate_digits.append(str(digit))
                    # Draw green circle on the detected box (was magenta)
                    box_h = boxes_num[3][col].shape[0]
                    box_w = boxes_num[3][col].shape[1]
                    center_x = int((col + 0.5) * box_w)
                    center_y = int((digit + 3 + 0.5) * box_h)
                    cv2.circle(
                        imgNumDraw,
                        (center_x, center_y),
                        min(box_w, box_h) // 3,
                        (0, 255, 0),  # Green
                        cv2.FILLED,
                    )
                candidate_number = "".join(candidate_digits)
                # Warp the green marks back to the original image
                invMatrixNum = cv2.getPerspectiveTransform(
                    np.float32(
                        [[0, 0], [fixed_w, 0], [0, fixed_h], [fixed_w, fixed_h]]
                    ),
                    pts1_num,
                )
                imgNumInvWarp = cv2.warpPerspective(
                    imgNumDraw, invMatrixNum, (widthImg, heightImg)
                )
        # Ensure the green marks for candidate number are visible on the final image
        imgFinal = cv2.addWeighted(imgFinal, 1, imgNumInvWarp, 1, 0)

        # Resize and combine images (now showing corner detection + final result)
        img_corners_small = cv2.resize(img_with_corners, (350, 350))
        img_final_small = cv2.resize(imgFinal, (350, 350))
        img_combined = np.hstack((img_corners_small, img_final_small))


        # Prepare result
        # Convert detected indexes to letters (0 -> 'A', 1 -> 'B', ...)
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
