import cv2
import time
import serial
from ultralytics import YOLO

# --- CONFIGURATION ---
SERIAL_PORT = 'COM4'  # Update to your ESP32 port
BAUD_RATE = 115200
OFF_DELAY_SECONDS = 5.0

# --- SERIAL SETUP ---
try:
    esp32 = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0.1)
    time.sleep(2)
    print(f"Connected to ESP32 on {SERIAL_PORT}")
except Exception as e:
    print(f"Serial Connection Error: {e}")
    esp32 = None

model = YOLO("yolov8n.pt")
cap = cv2.VideoCapture(0)

ROWS, COLS = 3, 3
last_seen_times = [0.0] * 9

def get_grid_index(x, y, width, height):
    col = min(max(int(x // (width / COLS)), 0), COLS - 1)
    row = min(max(int(y // (height / ROWS)), 0), ROWS - 1)
    return row * COLS + col

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    height, width, _ = frame.shape
    current_time = time.time()
    detected_in_grid = [False] * 9

    results = model(frame, verbose=False)[0]

    for box in results.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])

        if cls == 0 and conf > 0.45:  # Person class
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
            
            grid_idx = get_grid_index(cx, cy, width, height)
            detected_in_grid[grid_idx] = True
            last_seen_times[grid_idx] = current_time

            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.circle(frame, (cx, cy), 5, (0, 0, 255), -1)

    # Evaluate status with off-delay
    grid_states = []
    for i in range(9):
        is_active = detected_in_grid[i] or ((current_time - last_seen_times[i]) < OFF_DELAY_SECONDS)
        grid_states.append('1' if is_active else '0')

    # Transmit full 9-zone payload to ESP32
    command_str = "".join(grid_states) + "\n"
    if esp32 and esp32.is_open:
        esp32.write(command_str.encode('utf-8'))

    # --- RENDER ON-SCREEN DISPLAY ---
    col_w, row_h = width / COLS, height / ROWS

    # Draw grid boundaries
    for i in range(1, COLS):
        cv2.line(frame, (int(i * col_w), 0), (int(i * col_w), height), (255, 255, 255), 1)
    for j in range(1, ROWS):
        cv2.line(frame, (0, int(j * row_h)), (width, int(j * row_h)), (255, 255, 255), 1)

    # Label grids and show system roles
    for idx, state in enumerate(grid_states):
        r, c = idx // COLS, idx % COLS
        x_pos = int(c * col_w + 10)
        y_pos = int(r * row_h + 30)

        if idx < 2:
            # Grids 1 and 2: Active Light Controllers
            status = "LIGHT ON" if state == '1' else "LIGHT OFF"
            color = (0, 255, 0) if state == '1' else (0, 0, 255)
            label = f"G{idx+1} (CTRL): {status}"
        else:
            # Grids 3 to 9: Information-Only Monitoring
            status = "OCCUPIED" if state == '1' else "EMPTY"
            color = (255, 255, 0) if state == '1' else (128, 128, 128)
            label = f"G{idx+1} (INFO): {status}"

        cv2.putText(frame, label, (x_pos, y_pos), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    cv2.imshow("Hybrid Smart Room Monitor (2 Relays + 7 Info Zones)", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
if esp32:
    esp32.close()