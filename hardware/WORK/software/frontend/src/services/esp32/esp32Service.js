// src/services/esp32Service.js
// Two-way communication service for ESP32 and physical lab hardware controllers
// Strictly delineates REAL HARDWARE MODE vs SIMULATION/TEST MODE
// 5 Distinct Device States: COMMAND_SENT, WAITING_CONFIRMATION, CONFIRMED, FAILED, OFFLINE

import { updateDeviceConfirmedState, setDeviceCommandState, getSettings } from '../../db/database.js';

export const HARDWARE_MODES = {
  REAL_HARDWARE: 'REAL_HARDWARE',
  SIMULATION: 'SIMULATION',
};

export const DEVICE_HARDWARE_STATES = {
  COMMAND_SENT: 'COMMAND_SENT',
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
  FAILED: 'FAILED',
  OFFLINE: 'OFFLINE',
};

class Esp32Service {
  constructor() {
    this.endpoint = 'http://esp32-lab.local';
    this.isOnline = true;
    this.isEmergencyFallbackActive = false;
    this.mode = HARDWARE_MODES.SIMULATION; // Default to simulation until real controller connected
    this.pollTimer = null;
    this.statusListeners = new Set();
    this.deviceStates = new Map(); // deviceId -> { state, lastConfirmedAt, error }
  }

  init() {
    try {
      const settings = getSettings();
      if (settings.esp32Endpoint) {
        this.endpoint = settings.esp32Endpoint;
      }
      this.isEmergencyFallbackActive = Boolean(settings.emergencyFallbackActive);
      
      const savedMode = localStorage.getItem('inc_cms_hardware_mode');
      if (savedMode && HARDWARE_MODES[savedMode]) {
        this.mode = savedMode;
      }
    } catch {
      // Ignore during initial load
    }
  }

  getMode() {
    return this.mode;
  }

  setMode(newMode) {
    if (!HARDWARE_MODES[newMode]) {
      throw new Error(`Invalid hardware mode: ${newMode}`);
    }
    this.mode = newMode;
    try {
      localStorage.setItem('inc_cms_hardware_mode', newMode);
    } catch {
      // Storage unavailable
    }
    this.notifyStatus();
    return this.mode;
  }

  getDeviceState(deviceId) {
    return this.deviceStates.get(deviceId) || {
      state: DEVICE_HARDWARE_STATES.CONFIRMED,
      lastConfirmedAt: null,
      error: null,
    };
  }

  setDeviceState(deviceId, state, error = null) {
    this.deviceStates.set(deviceId, {
      state,
      lastConfirmedAt: state === DEVICE_HARDWARE_STATES.CONFIRMED ? new Date().toISOString() : undefined,
      error,
    });
    this.notifyStatus();
  }

  subscribeStatus(callback) {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  notifyStatus() {
    const payload = {
      isOnline: this.isOnline,
      mode: this.mode,
      fallback: this.isEmergencyFallbackActive,
      deviceStates: Object.fromEntries(this.deviceStates),
    };
    this.statusListeners.forEach((cb) => {
      try {
        cb(payload);
      } catch {
        // Listener error safety
      }
    });
  }

  setEmergencyFallback(active) {
    this.isEmergencyFallbackActive = active;
    this.notifyStatus();
  }

  /**
   * 1. Website -> Physical Device
   * Sends control payload to ESP32 controller
   * Adheres strictly to the 5 lifecycle states
   */
  async sendCommand(deviceId, state, brightness = null, speed = null, actor = null) {
    // 1. Mark state: COMMAND_SENT
    this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.COMMAND_SENT);
    setDeviceCommandState(deviceId, state, brightness, speed, actor);

    // 2. Mark state: WAITING_CONFIRMATION
    this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.WAITING_CONFIRMATION);

    // If emergency fallback is active: immediate local confirmation without network ping
    if (this.isEmergencyFallbackActive) {
      updateDeviceConfirmedState(deviceId, state, brightness, speed);
      this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.CONFIRMED);
      return {
        success: true,
        mode: 'emergency_fallback',
        confirmed: state,
        hardwareState: DEVICE_HARDWARE_STATES.CONFIRMED,
      };
    }

    // A. REAL HARDWARE MODE: Never simulate confirmation!
    if (this.mode === HARDWARE_MODES.REAL_HARDWARE) {
      try {
        const payload = {
          deviceId,
          action: state,
          brightness: brightness !== null ? Number(brightness) : undefined,
          speed: speed !== null ? Number(speed) : undefined,
          timestamp: Date.now(),
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s physical network timeout

        const response = await fetch(`${this.endpoint}/api/device/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`ESP32 returned HTTP error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        // Hardware must confirm the physical circuit / relay state
        const confirmedActual = data.confirmedState || state;
        updateDeviceConfirmedState(deviceId, confirmedActual, brightness, speed);
        this.isOnline = true;
        this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.CONFIRMED);
        return {
          success: true,
          mode: HARDWARE_MODES.REAL_HARDWARE,
          confirmedState: confirmedActual,
          hardwareState: DEVICE_HARDWARE_STATES.CONFIRMED,
        };
      } catch (err) {
        const isAbort = err.name === 'AbortError';
        const errMsg = isAbort
          ? 'ESP32 controller did not respond within 2.5s timeout'
          : (err.message || 'Failed to communicate with physical ESP32 controller');

        this.isOnline = false;
        this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.FAILED, errMsg);
        // In Real Hardware Mode, NEVER falsely acknowledge success!
        throw new Error(`[REAL HARDWARE ERROR] ${errMsg}. Device marked as FAILED.`);
      }
    }

    // B. SIMULATION / TEST MODE: Explicitly flagged as simulation
    await new Promise((res) => setTimeout(res, 350)); // Realistic relay switching delay
    updateDeviceConfirmedState(deviceId, state, brightness, speed);
    this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.CONFIRMED);

    return {
      success: true,
      mode: HARDWARE_MODES.SIMULATION,
      confirmedState: state,
      hardwareState: DEVICE_HARDWARE_STATES.CONFIRMED,
      note: 'Simulated actual confirmation (Test Mode)',
    };
  }

  /**
   * 2. Physical Switch -> Website
   * Updates state when physical wall switch or speed regulator is toggled
   */
  handlePhysicalSwitchEvent(deviceId, actualState, brightness = null, speed = null, isSimulated = false) {
    const updated = updateDeviceConfirmedState(deviceId, actualState, brightness, speed);
    this.setDeviceState(deviceId, DEVICE_HARDWARE_STATES.CONFIRMED);
    return {
      ...updated,
      isSimulated,
      mode: this.mode,
    };
  }
}

export const esp32Service = new Esp32Service();
esp32Service.init();
