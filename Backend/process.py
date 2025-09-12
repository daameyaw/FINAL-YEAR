import cv2
import sys
import numpy as np

def get_sorted_corners(pts):
    """Sorts the corners in the order: [Top-Left, Top-Right, Bottom-Right, Bottom-Left]"""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)

    rect[0] = pts[np.argmin(s)]  # Top-left
    rect[2] = pts[np.argmax(s)]  # Bottom-right
    rect[1] = pts[np.argmin(diff)]  # Top-right
    rect[3] = pts[np.argmax(diff)]  # Bottom-left
    return rect

def warp_perspective(image, rect, target_size=(400, 400)):
    """Applies a perspective transform to get a bird's-eye view of the largest rectangle."""
    rect = get_sorted_corners(rect)

    # Use a fixed size to avoid distortion
    dst = np.array([
        [0, 0],
        [target_size[0] - 1, 0],
        [target_size[0] - 1, target_size[1] - 1],
        [0, target_size[1] - 1]
    ], dtype="float32")

    # Compute transformation matrix & apply warp
    matrix = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, matrix, target_size)

    return warped

def detect_answers(image, num_questions=10, options_per_question=5):
    """Detects filled answer bubbles and returns detected choices."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)

    h, w = thresh.shape
    cell_h = h // num_questions
    cell_w = w // options_per_question

    detected_answers = []
    option_map = ['A', 'B', 'C', 'D', 'E']

    for q in range(num_questions):
        row_scores = []

        for o in range(options_per_question):
            y1 = q * cell_h
            y2 = (q + 1) * cell_h
            x1 = o * cell_w
            x2 = (o + 1) * cell_w

            cell = thresh[y1:y2, x1:x2]

            # Count black pixels (shaded areas)
            filled_ratio = np.count_nonzero(cell) / (cell_h * cell_w)
            row_scores.append(filled_ratio)

        selected_option = np.argmax(row_scores)
        detected_answers.append(option_map[selected_option])

    return detected_answers

def grade_exam(detected_answers, answer_key):
    """Compares detected answers with the answer key and calculates the score."""
    score = sum(1 for i in range(len(answer_key)) if detected_answers[i] == answer_key[i])
    return score, len(answer_key)

# Get image path from command-line
image_path = sys.argv[1]

# Read image and convert to grayscale
image = cv2.imread(image_path)
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# Preprocessing: Blur + Edge Detection
blurred = cv2.GaussianBlur(gray, (5, 5), 0)
edges = cv2.Canny(blurred, 50, 150)

# Find contours
contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Initialize largest rectangle variables
largest_area = 0
largest_rect = None

for contour in contours:
    approx = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
    if len(approx) == 4:  # Ensure it's a quadrilateral
        area = cv2.contourArea(approx)
        if area > largest_area:  # Keep track of the largest rectangle
            largest_area = area
            largest_rect = approx.reshape(4, 2)

# If no rectangle is found, exit
if largest_rect is None:
    print("No rectangle detected.")
    sys.exit(0)

# Warp the perspective to get a top-down view
warped_image = warp_perspective(image, largest_rect, target_size=(500, 1000))  # Adjust based on exam sheet

# Detect answers
detected_answers = detect_answers(warped_image, num_questions=10, options_per_question=5)

# Define answer key (Modify as per your exam)
answer_key = ['B', 'C', 'A', 'D', 'E', 'B', 'C', 'A', 'D', 'E']

# Grade the exam
score, total = grade_exam(detected_answers, answer_key)

# Print detected answers and score
print("Detected Answers:", detected_answers)
print(f"Final Score: {score} / {total}")

# Save and show the processed image
output_path = "processed_exam.jpg"
cv2.imwrite(output_path, warped_image)
cv2.imshow("Processed Exam", warped_image)
cv2.waitKey(0)
cv2.destroyAllWindows()
