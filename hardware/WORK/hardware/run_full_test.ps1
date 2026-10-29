# =============================================================================
# SMART LAB AUTOMATION — ONE-COMMAND FULL SYSTEM TEST
# =============================================================================
# Executes complete system verification across all 12 subsystems:
# - Unit tests (38 tests)
# - 3x3 zones
# - Gestures (0/1/2 hands)
# - 10-second non-blocking vacancy delay
# - Physical ESP32 relays (GPIO 22 & 23)
# - PZEM AC electrical telemetry
# - Master Status API & Clean CCTV stream
# - Safety reset: Relays forced OFF at conclusion
# =============================================================================

Write-Host "Running Smart Lab Full System Test Suite..." -ForegroundColor Cyan
python "$PSScriptRoot\run_full_test.py"
exit $LASTEXITCODE
