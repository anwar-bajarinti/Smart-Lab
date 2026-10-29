# Smart Lab

This repository brings together two related but independently developed Smart
Lab codebases. The folder layout makes the project boundary and contribution
ownership explicit while retaining the original Git histories.

## Repository layout

```text
Smart-Lab/
├── hardware/   # Smart Lab automation project developed by this repository's owner
├── software/   # Separate lab-management application contributed by a collaborator
├── README.md
└── .gitignore
```

### `hardware/`

Contains the owner's Smart Lab automation work, including hardware integration,
ESP32 firmware, relay control, PZEM-004T energy monitoring, computer vision,
the web dashboard, backend APIs, tests, and project documentation. The
directory name identifies the Smart Lab project scope; it includes the
full-stack software needed to operate and demonstrate the hardware.

### `software/`

Contains a separate campus laboratory and incubation management application
contributed by a collaborator. Its implementation is kept intact and is not
presented here as work developed by the owner of `hardware/`. The original
commit authorship remains available in Git history.

## `hardware/` architecture

The automation system detects people and gestures in a camera feed, maps
occupancy to a 3×3 zone grid, and controls appliances through an ESP32. Its
Flask API serves system state and energy telemetry to the dashboard.

```text
Camera → Pose detection and tracking → Zone and gesture control
       → Flask APIs and dashboard → ESP32 relays and PZEM telemetry
```

**Technologies:** Python, OpenCV, YOLOv8-Pose, Flask, HTML/CSS/JavaScript,
ESP32 Arduino/C++, relay modules, and PZEM-004T.

Run its tests from the project directory:

```powershell
cd hardware
python -m pytest tests -v
```

Other run and hardware-setup instructions are in [`hardware/README.md`](hardware/README.md),
[`hardware/SETUP.md`](hardware/SETUP.md), and the documentation under
`hardware/docs/`.

## `software/` architecture

The collaborator's application provides a laboratory and incubation centre
management portal. It includes a React frontend, a local OCR service, database
migrations, and Cloudflare Pages functions.

```text
React application → Supabase/PostgreSQL
                 → Local FastAPI OCR service (OpenCV and EasyOCR)
                 → Cloudflare Pages functions
```

**Technologies:** React 19, Vite, JavaScript, FastAPI, Python, OpenCV, EasyOCR,
Supabase/PostgreSQL, and Cloudflare Pages.

Its overview and commands are in [`software/README.md`](software/README.md).
Run its npm scripts from `software/` so the project's own package configuration
and lockfile are used.

## Contribution ownership and history

The `hardware/` project comes from the `appliance-control` development history;
the `software/` project comes from the collaborator-authored `main` history.
Those original branches are retained, and this organized view is assembled on
the `portfolio-structure` branch. File moves preserve the project contents and
make the original commit history available for attribution.
