import numpy as np
import cv2
import cv2.aruco as aruco

def create_aruco_marker(marker_id, marker_size_pixels, dictionary_type, output_filename):
	"""
	Generates and saves an ArUco marker image.

	Args:
		marker_id (int): The unique ID for the marker. Must be valid for the dictionary.
		marker_size_pixels (int): The size of the output image in pixels (width and height).
		dictionary_type: The predefined ArUco dictionary type (e.g., cv2.aruco.DICT_6X6_250).
		output_filename (str): The name of the file to save the marker to.
	"""
	# Load the predefined dictionary
	aruco_dict = aruco.getPredefinedDictionary(dictionary_type)

	# Create an empty NumPy array to draw the marker on (grayscale image)
	marker_image = np.zeros((marker_size_pixels, marker_size_pixels), dtype=np.uint8)

	# Generate the marker image using the dictionary, ID, and size
	# The last parameter (1) sets the border size in bits (typically 1 or 2)
	marker_image = aruco.generateImageMarker(aruco_dict, marker_id, marker_size_pixels, marker_image, 1)

	# Save the image to a file
	cv2.imwrite(output_filename, marker_image)
	print(f"Saved ArUco marker ID {marker_id} to {output_filename}")

# Example usage:
# Create marker with ID 23 from the 6x6 dictionary, image size 200x200 pixels
for x in range(1,17):
	create_aruco_marker(x, 200, aruco.DICT_6X6_250, f"marker{x}.png")

# To generate multiple markers, you can use a loop:
# for i in range(5):
#     create_aruco_marker(i, 200, aruco.DICT_6X6_250, f"marker_{i}.png")
