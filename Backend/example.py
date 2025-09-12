import cv2
import numpy as np
import sys
import debugi
import json  # Added for JSON output



def main():
    path = sys.argv[1]
    no_questions = int(sys.argv[2])  # Get from command line

    if no_questions > 60 or no_questions <= 0:
        print(json.dumps({"error": f"Number must be between 1 and 60"}))
        return

    # Rest of your processing logic here...
    # [Keep all your image processing code but remove cv2.imshow and cv2.waitKey]
    ans = [0, 1, 2, 2, 0, 0, 1, 2, 3, 3, 0, 1, 0, 2, 2, 2, 0, 1, 2, 2]

img = cv2.imread(path)

img = cv2.resize(img, (700, 700))

# we do img.copy() to avoid changing the original image
imgContours = img.copy()
imgBiggestContours = img.copy()
imgGrid = img.copy()
imgFinal = img.copy()

imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
imgBlur = cv2.GaussianBlur(imgGray, (5, 5), 1)
imgCanny = cv2.Canny(imgBlur, 10, 70)

# cv2.imshow("canny", imgCanny)

"""
imgThresh = cv2.threshold(imgGray, 115, 255, cv2.THRESH_BINARY_INV)[1]
imgAThresh = cv2.adaptiveThreshold(
    imgBlur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 199, 20
)
"""

# FIND ALL CONTOURS(polygons) IN THE IMAGE
contours, _ = cv2.findContours(imgCanny, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)


print("number of contours found = " + str(len(contours)))

cv2.drawContours(imgContours, contours, -1, (0, 255, 0), 2)


# FIND RECTANGLE CONTOURS
def rectContour(contours):
    
    """This function will return only the rectangle contours(polygons with 4 corners).Area is adjustible"""
    rectCon = []
    max_area = 0
    for i in contours:
        area = cv2.contourArea(i)
        if area > 50:
            peri = cv2.arcLength(i, True)  # perimeter of the contour
            approx = cv2.approxPolyDP(i, 0.02 * peri, True)
            if len(approx) == 4:
                rectCon.append(i)
    rectCon = sorted(rectCon, key=cv2.contourArea, reverse=True)
    # print(len(rectCon))
    return rectCon


# GET CORNER POINTS OF THE BIGGEST CONTOUR
def getCornerPoints(cont):
    """This function will return the corner points of the biggest contour"""
    peri = cv2.arcLength(cont, True)  # perimeter of the contour
    approx = cv2.approxPolyDP(
        cont, 0.02 * peri, True
    )  # APPROXIMATE THE POLY TO GET CORNER POINTS
    return approx


# REORDER POINTS FOR WARPING(takes the set of 4 coner points and outputs them in a consistent order).top-left, top-right, bottom-left, bottom-right
def reorder(myPoints):
    """Converts the points to a 4x2 matrix calculates minimum and maximum sum and difference to get the correct order"""
    myPoints = myPoints.reshape((4, 2))  # REMOVE EXTRA BRACKET
    print(myPoints)
    myPointsNew = np.zeros((4, 1, 2), np.int32)  # array to store the arranged points
    add = myPoints.sum(1)
    print(add)
    print(np.argmax(add))
    myPointsNew[0] = myPoints[np.argmin(add)]  # [0,0]
    myPointsNew[3] = myPoints[np.argmax(add)]  # [w,h]
    diff = np.diff(myPoints, axis=1)
    myPointsNew[1] = myPoints[np.argmin(diff)]  # [w,0]
    myPointsNew[2] = myPoints[np.argmax(diff)]  # [h,0]

    return myPointsNew


# DRAW 20*20 GRID ON THE WARP IMAGE
def drawGrid(img, grid_rows=20, grid_cols=20):
    """Draw a 20×20 grid on the image."""
    cell_h = img.shape[0] // grid_rows
    cell_w = img.shape[1] // grid_cols
    for i in range(1, grid_rows):
        cv2.line(img, (0, i * cell_h), (img.shape[1], i * cell_h), (255, 255, 0), 1)
    for j in range(1, grid_cols):
        cv2.line(img, (j * cell_w, 0), (j * cell_w, img.shape[0]), (255, 255, 0), 1)


# SPLIT GRID INTO INDIVIDUAL BOXES
def splitBoxes(img, grid_rows=20, grid_cols=20):
    """
    Splits the thresholded image into a grid (2D list of cells) and returns the list,
    along with the cell dimensions.
    """
    cell_h = img.shape[0] // grid_rows
    cell_w = img.shape[1] // grid_cols
    boxes = []
    rows_split = np.vsplit(img, grid_rows)
    for row in rows_split:
        cols_split = np.hsplit(row, grid_cols)
        boxes.append(cols_split)
    return boxes, cell_w, cell_h


def showAnswers(img, myIndex, grading, ans, cell_w, cell_h, no_questions):
    """
    Draw circles on the warped image indicating the detected answers.
    If the student's answer is wrong, a red circle is drawn at the student's position
    and a small green circle is drawn at the correct answer's position.
    Mapping:
      - For q < 20: row = q, options in grid columns 1-5.
      - For 20 ≤ q < 40: row = q-20, options in grid columns 8-12.
      - For 40 ≤ q < 60: row = q-40, options in grid columns 15-19.
    """
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
        # Calculate student's answer center:
        x_center_student = int((offset + myIndex[q] + 0.5) * cell_w)
        y_center = int((row + 0.5) * cell_h)
        if grading[q] == 1:
            cv2.circle(img, (x_center_student, y_center), 10, (0, 255, 0), cv2.FILLED)
        else:
            cv2.circle(img, (x_center_student, y_center), 10, (0, 0, 255), cv2.FILLED)
            # Draw the correct answer mark (smaller green circle)
            x_center_correct = int((offset + ans[q] + 0.5) * cell_w)
            cv2.circle(img, (x_center_correct, y_center), 5, (0, 255, 0), cv2.FILLED)


biggestContour = getCornerPoints(rectContour(contours)[0])
cv2.drawContours(imgBiggestContours, biggestContour, -1, (0, 255, 0), 20)

if biggestContour.size != 0:
    biggestContour = reorder(biggestContour)
    pts1 = np.float32(biggestContour)
    pts2 = np.float32([[0, 0], [widthImg, 0], [0, heightImg], [widthImg, widthImg]])
    matrix = cv2.getPerspectiveTransform(pts1, pts2)
    imgWarpColored = cv2.warpPerspective(img, matrix, (widthImg, heightImg))

    imgWarpGray = cv2.cvtColor(imgWarpColored, cv2.COLOR_BGR2GRAY)
    imgWarpBlur = cv2.GaussianBlur(imgWarpGray, (5, 5), 1)
    # imgThresh = cv2.threshold(imgWarpBlur, 115, 255, cv2.THRESH_BINARY_INV)[1]
    imgAThresh = cv2.adaptiveThreshold(
        imgWarpGray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 199, 20
    )

    imgAThreshGrid = cv2.cvtColor(imgAThresh, cv2.COLOR_GRAY2BGR)
    drawGrid(imgAThreshGrid)
    # cv2.imshow("Grid & Answers", imgAThreshWarpDraw)
    print("number of channels ", imgAThreshGrid.shape)

    boxes, cell_w, cell_h = splitBoxes(imgAThresh, 20, 20)
    # print("number of boxes" + str(len(boxes[0])))
    # test_box1 = boxes[19][3]
    # cv2.imshow("Test Box (Row 0, Column 1)", test_box1)

    myPixelVal = np.zeros((no_questions, choices))
    for q in range(no_questions):
        if q < 20:
            row = q
            option_range = range(1, 6)  # Options in grid columns 1-5
        elif q < 40:
            row = q - 20
            option_range = range(8, 13)  # Options in grid columns 8-12
        else:
            row = q - 40
            option_range = range(15, 20)  # Options in grid columns 15-19
        for i, c in enumerate(option_range):
            box = boxes[row][c]
            myPixelVal[q][i] = cv2.countNonZero(box) / float(box.size)

    print("Normalized Pixel Values:", myPixelVal)

    myIndex = [np.argmax(myPixelVal[q]) for q in range(no_questions)]
    grading = [1 if ans[q] == myIndex[q] else 0 for q in range(no_questions)]
    # score = (sum(grading) / float(no_questions)) * 100
    score = sum(grading)
    print("Grading:", grading)
    print("Score:", score)

    # Put text on the final image
    cv2.putText(
        imgFinal,
        f"Score: {score}",
        (70, 100),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2,
        cv2.LINE_AA,
    )

    imgDrawAns = np.zeros_like(imgAThreshGrid)
    # imgDrawAns = cv2.cvtColor(imgAThreshGrid, cv2.COLOR_GRAY2BGR)
    showAnswers(imgDrawAns, myIndex, grading, ans, cell_w, cell_h, no_questions)

    invMatrix = cv2.getPerspectiveTransform(pts2, pts1)
    imgInvWarp = cv2.warpPerspective(imgDrawAns, invMatrix, (widthImg, heightImg))
    imgFinal = cv2.addWeighted(imgFinal, 1, imgInvWarp, 1, 0)
    # cv2.imshow("Final", imgFinal)

imgBlank = np.zeros_like(img)

labels = (
    ["oriiginal", "gray", "blur", "canny"],
    ["contours", "biggest contours", "warped contour", "adaptive threshold"],
    ["grid draw", "mark answers", "blank", "blank"],
)

imgArray = (
    [
        img,
        imgGray,
        imgBlur,
        imgCanny,
    ],
    [imgContours, imgBiggestContours, imgWarpColored, imgAThresh],
    [imgAThreshGrid, imgDrawAns, imgBlank, imgBlank],
)
imgStack = debugi.stackImages(imgArray, 0.3, labels)

    # After processing, create result
    result = {
        "score": int(score),
        "correct": sum(grading),
        "total": no_questions,
        "grading": grading
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()