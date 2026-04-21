import json

with open("sample.json", 'r', encoding='utf-8') as file:
	data = json.load(file)

print(data["SunAzim"])
print(data["SunElev"])
print(data["TrackerList"][0]["FrameHeading"])
print(data["TrackerList"][0]["FrameElev"])
print(data["TrackerList"][1]["FrameHeading"])
print(data["TrackerList"][1]["FrameElev"])