import cv2
import numpy as np
import easyocr
import re
import time

# Initialize EasyOCR
reader = easyocr.Reader(['en'], gpu=False)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

def enhance_close_up_card(img_bgr):
    """
    Optimized for 5-7 cm close-up:
    - Normalizes laptop screen reflections/glare
    - Balances local lighting so small details in large text stay crisp
    """
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)

    enhanced = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)
    denoised = cv2.bilateralFilter(enhanced, 5, 40, 40)
    return denoised

def sanitize_roll_candidate(raw_token):
    t = re.sub(r'[^A-Za-z0-9]', '', raw_token).upper()

    if t.isalpha() or len(t) < 8 or len(t) > 12:
        return None

    if len(t) == 11 and t[0] in ['I', 'L', '1', '|']:
        t = t[1:]

    if len(t) == 10:
        t_list = list(t)
        for i in [0, 1]:
            if t_list[i] in ['O', 'Q', 'D']: t_list[i] = '0'
            elif t_list[i] in ['I', 'L', '|']: t_list[i] = '1'
            elif t_list[i] == 'Z': t_list[i] = '2'
            elif t_list[i] == 'S': t_list[i] = '5'
            elif t_list[i] == 'B': t_list[i] = '8'

        if t_list[4] in ['I', 'L', '|']: t_list[4] = '1'
        elif t_list[4] == 'S': t_list[4] = '5'

        if t_list[5] == '4': t_list[5] = 'A'

        repaired = "".join(t_list)

        if re.match(r'^[0-9]{2}[A-Z0-9]{2}[15][A-Z][0-9A-Z]{4}$', repaired):
            return repaired
        elif re.match(r'^[0-9]{2}[A-Z0-9]{8}$', repaired):
            return repaired

    return None

def parse_id_card_data(extracted_lines):
    ignore_keywords = [
        "BRANCH", "VALIDITY", "VALID", "DEPT", "DEPARTMENT", 
        "COLLEGE", "INSTITUTE", "STUDENT", "IDENTITY", "CARD", 
        "DOB", "DATE", "SIGNATURE", "BLOOD", "GROUP", "ECE", "CSE", "IT", "EEE", "MECH"
    ]
    
    extracted_name = None
    extracted_roll = None

    # 1. Search for Roll Number
    for raw_line in extracted_lines:
        line_clean = raw_line.strip().upper()
        
        parts = re.split(r'[\s\-]+', line_clean)
        for part in parts:
            candidate = sanitize_roll_candidate(part)
            if candidate:
                extracted_roll = candidate
                break
        if extracted_roll:
            break

        collapsed = re.sub(r'[^A-Za-z0-9]', '', line_clean)
        if len(collapsed) >= 10:
            for i in range(len(collapsed) - 9):
                sub = collapsed[i:i+10]
                candidate = sanitize_roll_candidate(sub)
                if candidate:
                    extracted_roll = candidate
                    break
        if extracted_roll:
            break

    # 2. Search for Name
    for raw_line in extracted_lines:
        line_clean = raw_line.strip().upper()

        if any(keyword in line_clean for keyword in ignore_keywords):
            continue

        if extracted_roll and (extracted_roll in re.sub(r'[^A-Za-z0-9]', '', line_clean)):
            continue

        name_clean = re.sub(r'[^A-Z\s.]', '', line_clean).strip()
        name_clean = re.sub(r'^[I|l]\s*', '', name_clean)

        if len(name_clean) >= 4 and not extracted_name:
            if " " in name_clean or "." in name_clean:
                if not any(inst in name_clean for inst in ["UNIVERSITY", "ENGINEERING", "TECHNOLOGY", "AUTONOMOUS"]):
                    extracted_name = name_clean

    return extracted_name, extracted_roll

print("================================================================")
print("HANDS-FREE SMART AUTO-SCANNER ACTIVE")
print("1. Hold the card at 5-7 cm inside the green guide box.")
print("2. The engine will automatically scan and capture when sharp.")
print("3. Press 'q' to quit.")
print("================================================================")

frame_count = 0
last_scan_time = 0
COOLDOWN_PERIOD = 3.5  # Seconds to wait after a successful extraction
last_extracted_name = None
last_extracted_roll = None

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    
    box_w, box_h = 880, 520
    start_x = (w - box_w) // 2
    start_y = (h - box_h) // 2
    end_x = start_x + box_w
    end_y = start_y + box_h

    roi = frame[start_y:end_y, start_x:end_x]
    display = frame.copy()

    current_time = time.time()
    in_cooldown = (current_time - last_scan_time) < COOLDOWN_PERIOD

    # Automatic evaluation: Run background recognition check every 8 frames
    if not in_cooldown and (frame_count % 8 == 0):
        enhanced = enhance_close_up_card(roi)

        # Fast check pass
        results = reader.readtext(
            enhanced,
            decoder='beamsearch',
            beamWidth=5,
            paragraph=False,
            text_threshold=0.30,
            low_text=0.15,
            link_threshold=0.25,
            mag_ratio=1.0
        )

        all_tokens = [text.strip() for bbox, text, conf in results if len(text.strip()) >= 2 and conf > 0.20]
        name, roll_no = parse_id_card_data(all_tokens)

        # TARGET LOCK: Auto-trigger when BOTH Name and Roll Number are clearly detected
        if name and roll_no:
            last_extracted_name = name
            last_extracted_roll = roll_no
            last_scan_time = time.time()

            print("\n================== PARSED ID DATA ==================")
            print(f"NAME        : {last_extracted_name}")
            print(f"ROLL NUMBER : {last_extracted_roll}")
            print("====================================================\n")

    frame_count += 1

    # Dynamic UI Feedback
    if in_cooldown:
        box_color = (0, 255, 0)
        status_text = f"CAPTURED: {last_extracted_roll} | Ready in {int(COOLDOWN_PERIOD - (current_time - last_scan_time)) + 1}s"
    else:
        box_color = (0, 215, 255)
        status_text = "Scanning card... Hold steady at 5-7 cm"

    cv2.rectangle(display, (start_x, start_y), (end_x, end_y), box_color, 2)
    cv2.putText(display, status_text, (start_x, start_y - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, box_color, 2)

    cv2.imshow("ID Scanner Feed", display)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()