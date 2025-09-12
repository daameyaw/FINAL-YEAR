import cv2
import numpy as np
import sys

# Load the image path from the command line
image_path = sys.argv[1]

# Parameters
widthImg = 700
heightImg = 700
total_questions = 60
choices = 5

# Define correct answers (Example: first 20 questions)
correct_answers = [0, 1, 2, 2, 0, 0, 1, 2, 3, 3, 0, 1, 0, 2, 2, 2, 0, 1, 2, 2]

# Load image
img = cv2.imread(image_path)
img = cv2.resize(img, (widthImg, heightImg))

# Preprocessing
imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
imgBlur = cv2.GaussianBlur(imgGray, (5, 5), 1)
imgCanny = cv2.Canny(imgBlur, 10, 70)

# Find contours
contours, _ = cv2.findContours(imgCanny, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

# Function to find rectangle contours
def rectContour(contours):
    rectCon = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area > 5000:
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
            if len(approx) == 4:
                rectCon.append(approx)
    return sorted(rectCon, key=cv2.contourArea, reverse=True)

# Find the biggest contour (OMR sheet)
biggestContour = rectContour(contours)[0]

# Warp perspective
if biggestContour.size != 0:
    biggestContour = np.array(biggestContour).reshape((4, 2))
    pts1 = np.float32(biggestContour)
    pts2 = np.float32([[0, 0], [widthImg, 0], [0, heightImg], [widthImg, heightImg]])
    matrix = cv2.getPerspectiveTransform(pts1, pts2)
    imgWarpGray = cv2.warpPerspective(imgGray, matrix, (widthImg, heightImg))
    imgThresh = cv2.threshold(imgWarpGray, 150, 255, cv2.THRESH_BINARY_INV)[1]

    # Split into boxes (assuming 20 rows × 5 columns per section)
    rows = np.vsplit(imgThresh, 20)
    boxes = [np.hsplit(row, choices) for row in rows]
    
    # Detect marked answers
    user_answers = []
    for row in boxes:
        max_intensity = [np.sum(cell) for cell in row]
        selected_option = np.argmax(max_intensity)
        user_answers.append(selected_option)

    # Grade the answers
    score = sum([1 if user_answers[i] == correct_answers[i] else 0 for i in range(len(correct_answers))])
    percentage = (score / len(correct_answers)) * 100

    # Output result
    print(f"Score: {score}/{len(correct_answers)}, Percentage: {percentage:.2f}%")
else:
    print("Error: No valid OMR sheet detected.")
