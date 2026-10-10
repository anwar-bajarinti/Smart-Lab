# Smart Lab Automation - Frontend Web Dashboard

## 1. Overview
The Frontend is a modern, responsive single-page application (SPA) optimized for desktop monitors, wall-mounted tablets, and mobile screens.

## 2. Features

### 2.1 9-Zone Interactive Grid
- Cards for **Z1 through Z9**.
- Displays:
  - Zone Name and Identification.
  - Occupancy state badge (`OCCUPIED` with green pulsating glow vs `EMPTY`).
  - Active Mode badge (`AUTO`, `MANUAL_ON`, `MANUAL_OFF`).
  - Individual **Light ON/OFF** toggle buttons.
  - Individual **Fan ON/OFF** toggle buttons and **0–100% speed slider**.
  - Current occupant list and tracking IDs.

### 2.2 Vision AI Live Monitor Tab
- Shows live MJPEG camera feed streamed directly from `/api/vision/feed`.
- Visualizes 3×3 grid lines, person bounding boxes, skeletal joints, floor contact points, and diagnostic badges.
- Live occupant telemetry table showing tracked IDs, current zones, detected gestures, and active control modes.

### 2.3 PZEM-004T Energy Analytics Tab
- Real-time gauge metrics:
  - Mains Voltage ($V$)
  - Total Current Draw ($A$)
  - Active Power ($W$)
  - Cumulative Energy ($kWh$)
  - Grid AC Frequency ($Hz$)
  - Power Factor ($PF$)
- Hardware connection indicator (`REAL HARDWARE CONNECTED` vs `DEV / SIMULATION MODE`).

## 3. Serving & Accessing
The dashboard is automatically hosted by the Flask backend at:
```
http://localhost:5000/
```
No additional build or compile step is required.
