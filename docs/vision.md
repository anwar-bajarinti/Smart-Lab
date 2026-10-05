# Smart Lab Automation - Vision Subsystem

## 1. Overview
The Vision subsystem uses a laptop webcam to track occupants across a 9-zone laboratory floor plan and recognize biomechanical arm gestures in real time.

## 2. Key Components

### 2.1 Person and Pose Detection (`vision/person_detector.py`)
- Powered by Ultralytics **YOLOv8-Pose** (`yolov8n-pose.pt`).
- Tracks multiple people simultaneously using **ByteTrack** with persistent IDs across video frames.
- Extracts 17 COCO skeletal landmarks:
  - Shoulders (5, 6)
  - Elbows (7, 8)
  - Wrists (9, 10)
  - Hips (11, 12)
  - Knees (13, 14)
  - Ankles (15, 16)

### 2.2 Floor Localization (`vision/pose_detector.py`)
Hands must NOT determine a person's physical location. The system calculates physical floor contact using:
1. **Primary**: Midpoint between left and right ankles:
   $$\text{Feet} = \left(\frac{x_{\text{left\_ankle}} + x_{\text{right\_ankle}}}{2}, \frac{y_{\text{left\_ankle}} + y_{\text{right\_ankle}}}{2}\right)$$
2. **Fallback**: Single visible ankle if only one is in frame.
3. **Bounding Box Fallback**: Bottom-center coordinate:
   $$\text{Feet}_{\text{fallback}} = \left(\frac{x_1 + x_2}{2}, y_2\right)$$

### 2.3 Biomechanical Gesture Recognition (`vision/gesture_detector.py`)
To avoid false triggers from typing, scratching head, or swinging arms while walking:
- A hand is considered **RAISED** only when:
  - Wrist $y$-coordinate is strictly above the corresponding shoulder with an adaptive torso clearance:
    $$y_{\text{wrist}} < y_{\text{shoulder}} - (0.05 \times \text{TorsoScale})$$
    *(Note: in pixel coordinates, $y=0$ is at the top of the image).*
  - Wrist is higher than or level with the elbow:
    $$y_{\text{wrist}} \le y_{\text{elbow}} + (0.10 \times \text{TorsoScale})$$
  - Keypoint confidence exceeds minimum threshold (0.35).

### 2.4 Gesture State Mapping
- **0 Hands Raised** $\rightarrow$ `AUTO`
- **1 Hand Raised** $\rightarrow$ `MANUAL_OFF`
- **2 Hands Raised** $\rightarrow$ `MANUAL_ON`

### 2.5 Temporal Debounce / Stability (`vision/person_state.py`)
A gesture must remain stable for at least **0.8 seconds** before triggering a state change. Single-frame spikes or brief hand movements are safely rejected.

### 2.6 Inter-Zone Isolation (Requirement 11)
When a person moves from $Z_a \rightarrow Z_b$:
- The manual override from $Z_a$ does NOT follow the person.
- The person resets to `AUTO` upon entering $Z_b$.
- $Z_a$ becomes empty and switches OFF after the 2.5s vacancy timeout.

## 3. Running the Vision System
```bash
python -m vision.main --camera 0 --config config/system_config.json --sync-backend
```
Controls:
- Press `q` or `ESC` to exit.
- Press `m` to toggle webcam mirroring.
