// src/pages/ControlTab.jsx
// Main TAB 1: Lab Devices & Environmental Control
// Features: Two-way ESP32 hardware synchronization, physical switch feedback, voice control (Admins only),
// full digital light & fan controls (All students), and private power monitoring (Admins only).

import React, { useState, useEffect, useRef } from 'react';
import {
  Lightbulb,
  Fan,
  Wind,
  Tv,
  Camera,
  Mic,
  MicOff,
  Radio,
  Zap,
  IndianRupee,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  ShieldCheck,
  Lock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  getDevices,
  getPowerMonitoringStats,
  setDeviceCommandState,
  updateDeviceConfirmedState,
  subscribeToDb,
} from '../../db/database';
import { esp32Service, HARDWARE_MODES, DEVICE_HARDWARE_STATES } from '../../services/esp32/esp32Service';

export default function ControlTab({ currentUser, onToast }) {
  const [devices, setDevices] = useState([]);
  const [powerStats, setPowerStats] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState('');
  const [isEmergencyFallback, setIsEmergencyFallback] = useState(false);
  const [isSyncingWithEsp32, setIsSyncingWithEsp32] = useState(false);
  const [hwMode, setHwMode] = useState(esp32Service.getMode());
  const [, setHardwareTick] = useState(0);

  const recognitionRef = useRef(null);
  const isStudent = currentUser?.role === 'student';
  const isAdminOrSubstitute = currentUser?.role === 'admin' || currentUser?.role === 'substitute_admin';

  useEffect(() => {
    loadData();
    const unsubscribeDb = subscribeToDb(() => loadData());
    const unsubscribeEsp = esp32Service.subscribeStatus((status) => {
      if (status.mode) setHwMode(status.mode);
      if (status.fallback !== undefined) setIsEmergencyFallback(status.fallback);
      setHardwareTick((t) => t + 1);
    });
    return () => {
      unsubscribeDb();
      unsubscribeEsp();
    };
  }, [currentUser]);

  function loadData() {
    const devs = getDevices(currentUser?.role);
    setDevices(devs);

    if (isAdminOrSubstitute) {
      try {
        const pStats = getPowerMonitoringStats(currentUser?.role);
        setPowerStats(pStats);
      } catch (e) {
        console.warn('Power stats read error:', e);
      }
    }
  }

  // Hardware Mode Switcher (Real ESP32 vs Simulation/Test)
  function toggleHardwareMode() {
    const next = hwMode === HARDWARE_MODES.REAL_HARDWARE ? HARDWARE_MODES.SIMULATION : HARDWARE_MODES.REAL_HARDWARE;
    esp32Service.setMode(next);
    setHwMode(next);
    if (onToast) {
      onToast(next === HARDWARE_MODES.REAL_HARDWARE ? 'Mode: REAL HARDWARE (Commands dispatched to physical ESP32)' : 'Mode: SIMULATION / TEST (Safe offline simulation)');
    }
  }

  function renderHardwareStatus(device) {
    const hw = esp32Service.getDeviceState(device.id);
    const state = hw?.state || (device.commandedState !== device.actualState ? DEVICE_HARDWARE_STATES.WAITING_CONFIRMATION : DEVICE_HARDWARE_STATES.CONFIRMED);

    switch (state) {
      case DEVICE_HARDWARE_STATES.COMMAND_SENT:
        return (
          <span className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#b45309' }}>
            <RefreshCw size={12} className="spin" /> Command Sent...
          </span>
        );
      case DEVICE_HARDWARE_STATES.WAITING_CONFIRMATION:
        return (
          <span className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#0284c7' }}>
            <RefreshCw size={12} className="spin" /> Awaiting Relay Confirmation...
          </span>
        );
      case DEVICE_HARDWARE_STATES.FAILED:
        return (
          <span className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger)', fontWeight: 600 }} title={hw?.error || 'Physical relay confirmation failed'}>
            <AlertTriangle size={12} /> Hardware Confirmation Failed
          </span>
        );
      case DEVICE_HARDWARE_STATES.OFFLINE:
        return (
          <span className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--neutral-500)' }}>
            <WifiOff size={12} /> ESP32 Controller Offline
          </span>
        );
      case DEVICE_HARDWARE_STATES.CONFIRMED:
      default:
        return (
          <span className="text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--neutral-600)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: device.actualState === 'ON' ? 'var(--success)' : 'var(--neutral-400)' }}></span>
            Confirmed: {device.actualState}
          </span>
        );
    }
  }

  // 1. Device Control Action (Website -> Physical Device)
  async function handleToggleDevice(dev) {
    const nextState = dev.commandedState === 'ON' ? 'OFF' : 'ON';
    setIsSyncingWithEsp32(true);
    try {
      await esp32Service.sendCommand(dev.id, nextState, dev.brightness, dev.speed, currentUser);
      if (onToast) onToast(`${dev.name} commanded ${nextState}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSyncingWithEsp32(false);
    }
  }

  async function handleBrightnessChange(dev, newBrightness) {
    const val = Number(newBrightness);
    setDeviceCommandState(dev.id, dev.commandedState, val, dev.speed, currentUser);
    try {
      await esp32Service.sendCommand(dev.id, dev.commandedState, val, dev.speed, currentUser);
    } catch (err) {
      console.warn(err);
    }
  }

  async function handleSpeedChange(dev, newSpeed) {
    const val = Number(newSpeed);
    setDeviceCommandState(dev.id, dev.commandedState, dev.brightness, val, currentUser);
    try {
      await esp32Service.sendCommand(dev.id, dev.commandedState, dev.brightness, val, currentUser);
    } catch (err) {
      console.warn(err);
    }
  }

  // 2. Physical Switch -> Website Simulator
  // Demonstrates two-way synchronization when someone toggles a physical wall switch in the lab
  function handleSimulatePhysicalSwitch(dev, type = 'wall switch') {
    const physicalState = dev.actualState === 'ON' ? 'OFF' : 'ON';
    esp32Service.handlePhysicalSwitchEvent(dev.id, physicalState, dev.brightness, dev.speed, true);
    if (onToast) onToast(`[Hardware Simulator] ${dev.name} simulated ${type} toggled to ${physicalState}`);
  }

  // 3. Emergency / Manual Fallback Toggle (Admin & Substitute Admin only)
  function toggleEmergencyFallback() {
    const next = !isEmergencyFallback;
    setIsEmergencyFallback(next);
    esp32Service.setEmergencyFallback(next);
    if (onToast) {
      onToast(next ? 'Emergency Manual Fallback Activated (Bypasses ESP32 timeouts)' : 'Emergency Fallback Deactivated (Normal two-way sync active)');
    }
  }

  // 4. Voice Control (Web Speech API) - Strictly Admin & Substitute Admin only!
  function toggleVoiceControl() {
    if (isStudent) return; // Strict role enforcement

    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome, Brave, or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceFeedback('Listening for command (e.g. "Turn on all lights", "Turn off fan 1")...');
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      setVoiceFeedback(`Command heard: "${transcript}"`);
      processVoiceCommand(transcript);
    };

    recognition.onerror = (e) => {
      setVoiceFeedback(`Voice error: ${e.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function processVoiceCommand(text) {
    const isTurnOn = text.includes('turn on') || text.includes('switch on') || text.includes('activate');
    const isTurnOff = text.includes('turn off') || text.includes('switch off') || text.includes('deactivate');

    if (text.includes('all lights')) {
      devices.filter((d) => d.type === 'light').forEach((d) => {
        esp32Service.sendCommand(d.id, isTurnOn ? 'ON' : 'OFF', d.brightness, d.speed, currentUser);
      });
      if (onToast) onToast(`All lights turned ${isTurnOn ? 'ON' : 'OFF'} via voice command.`);
      return;
    }

    if (text.includes('all fans')) {
      devices.filter((d) => d.type === 'fan').forEach((d) => {
        esp32Service.sendCommand(d.id, isTurnOn ? 'ON' : 'OFF', d.brightness, d.speed, currentUser);
      });
      if (onToast) onToast(`All fans turned ${isTurnOn ? 'ON' : 'OFF'} via voice command.`);
      return;
    }

    // Match individual devices
    for (const dev of devices) {
      const nameWords = dev.name.toLowerCase().split(' ');
      if (nameWords.some((w) => text.includes(w) && w.length > 2)) {
        if (isTurnOn || isTurnOff) {
          esp32Service.sendCommand(dev.id, isTurnOn ? 'ON' : 'OFF', dev.brightness, dev.speed, currentUser);
          if (onToast) onToast(`${dev.name} set to ${isTurnOn ? 'ON' : 'OFF'} via voice command.`);
          return;
        }
      }
    }

    setVoiceFeedback(`Could not match command: "${text}". Try "Turn on all lights" or "Turn off fan 1".`);
  }

  const lights = devices.filter((d) => d.type === 'light');
  const fans = devices.filter((d) => d.type === 'fan');
  const acs = devices.filter((d) => d.type === 'ac');
  const projectors = devices.filter((d) => d.type === 'projector');
  const cameras = devices.filter((d) => d.type === 'camera');

  return (
    <div className="control-tab-container">
      {/* Top Header & Two-Way Sync Bar */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Lab Environmental & Device Controls
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            {isStudent
              ? 'Digital controls for all lab lights and fans. Changes sync directly to the physical lab.'
              : 'Full laboratory device controls, two-way ESP32 hardware synchronization, and power analytics.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Hardware status pill */}
          <div
            className="navbar-stat-pill"
            style={{
              background: isEmergencyFallback ? 'var(--warning-light)' : 'var(--success-light)',
              color: isEmergencyFallback ? 'var(--warning-text)' : 'var(--success-text)',
              border: `1px solid ${isEmergencyFallback ? 'var(--warning-border)' : 'var(--success-border)'}`,
            }}
          >
            {isEmergencyFallback ? <WifiOff size={15} /> : <Wifi size={15} />}
            <span>{isEmergencyFallback ? 'Emergency Manual Fallback' : 'ESP32 Two-Way Sync Active'}</span>
          </div>

          {/* Mode Switcher Button */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={toggleHardwareMode}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: hwMode === HARDWARE_MODES.REAL_HARDWARE ? '#e0f2fe' : '#fef3c7',
              color: hwMode === HARDWARE_MODES.REAL_HARDWARE ? '#0369a1' : '#b45309',
              border: `1px solid ${hwMode === HARDWARE_MODES.REAL_HARDWARE ? '#7dd3fc' : '#fcd34d'}`,
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.75rem',
            }}
            title="Switch between Real Hardware (ESP32) Mode and Simulation/Test Mode"
          >
            <Sliders size={14} />
            <span>{hwMode === HARDWARE_MODES.REAL_HARDWARE ? 'Mode: Real ESP32 Hardware' : 'Mode: Simulation / Test'}</span>
          </button>

          {/* Voice Control (Strictly Admin / Substitute Admin) */}
          {isAdminOrSubstitute && (
            <button
              type="button"
              className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
              onClick={toggleVoiceControl}
              title="Speak commands like 'Turn on all lights' or 'Turn off fan 1'"
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              {isListening ? 'Listening...' : 'Voice Control'}
            </button>
          )}

          {/* Emergency Fallback Toggle (Admin only) */}
          {isAdminOrSubstitute && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={toggleEmergencyFallback}
              title="Toggle emergency fallback mode when physical ESP32 communication fails"
            >
              <Sliders size={14} /> Fallback Mode
            </button>
          )}
        </div>
      </div>

      {voiceFeedback && (
        <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
          <Radio size={18} />
          <span>{voiceFeedback}</span>
        </div>
      )}

      {/* TWO-WAY HARDWARE SYNCHRONIZATION BANNER */}
      <div className="card" style={{ background: '#f8fafc', border: '1px solid var(--neutral-200)', marginBottom: '1.5rem' }}>
        <div className="card-body" style={{ padding: '0.85rem 1.25rem' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)' }}></div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neutral-800)' }}>
                Two-Way Sync: Website UI $\leftrightarrow$ ESP32 Microcontroller $\leftrightarrow$ Physical Wall Switches & Relays
              </span>
            </div>
            <span className="text-xs text-muted">
              Confirmed state reflects actual physical hardware feedback.
            </span>
          </div>
        </div>
      </div>

      {/* 1. ALL LIGHTS SECTION (Accessible to Students, Substitute Admin & Admin) */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Lightbulb size={20} style={{ color: '#eab308' }} /> All Lab Lights (ON/OFF + Brightness)
          </h3>
          <span className="badge badge-success">Students & Admins Permitted</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {lights.map((light) => {
              const isOn = light.actualState === 'ON';
              const isSyncing = light.commandedState !== light.actualState;

              return (
                <div
                  key={light.id}
                  style={{
                    border: '1px solid var(--neutral-200)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    background: isOn ? '#fefce8' : '#ffffff',
                    boxShadow: isOn ? '0 4px 12px rgba(234, 179, 8, 0.15)' : 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div className="flex-between">
                    <div>
                      <strong style={{ fontSize: '1rem', color: 'var(--neutral-900)' }}>{light.name}</strong>
                      <div className="text-xs text-muted">{light.location}</div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${isOn ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{
                        background: isOn ? '#ca8a04' : '#f1f5f9',
                        color: isOn ? '#fff' : 'var(--neutral-700)',
                        border: 'none',
                        minWidth: '70px',
                      }}
                      onClick={() => handleToggleDevice(light)}
                    >
                      <Power size={14} /> {isOn ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Brightness Slider */}
                  <div style={{ marginTop: '1rem' }}>
                    <div className="flex-between text-xs" style={{ marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>Brightness / Intensity:</span>
                      <strong>{light.brightness}%</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={light.brightness}
                      onChange={(e) => handleBrightnessChange(light, e.target.value)}
                      disabled={!isOn}
                      style={{ width: '100%', accentColor: '#ca8a04', cursor: isOn ? 'pointer' : 'not-allowed' }}
                    />
                  </div>

                  {/* Hardware Status Indicator & Physical Switch Simulator */}
                  <div className="flex-between" style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px dashed #e2e8f0' }}>
                    {renderHardwareStatus(light)}

                    <button
                      type="button"
                      className="btn-link text-xs"
                      onClick={() => handleSimulatePhysicalSwitch(light, 'wall switch')}
                      title="Simulate someone flipping the physical wall switch in the lab (Test Mode)"
                    >
                      Switch Simulator (Test Mode)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. ALL FANS SECTION (Accessible to Students, Substitute Admin & Admin) */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Fan size={20} style={{ color: '#0284c7' }} /> All Lab Fans (ON/OFF + Speed 1-5)
          </h3>
          <span className="badge badge-success">Students & Admins Permitted</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {fans.map((fan) => {
              const isOn = fan.actualState === 'ON';
              const isSyncing = fan.commandedState !== fan.actualState;

              return (
                <div
                  key={fan.id}
                  style={{
                    border: '1px solid var(--neutral-200)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    background: isOn ? '#f0f9ff' : '#ffffff',
                    boxShadow: isOn ? '0 4px 12px rgba(2, 132, 199, 0.15)' : 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div className="flex-between">
                    <div>
                      <strong style={{ fontSize: '1rem', color: 'var(--neutral-900)' }}>{fan.name}</strong>
                      <div className="text-xs text-muted">{fan.location}</div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${isOn ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      style={{
                        background: isOn ? '#0284c7' : '#f1f5f9',
                        color: isOn ? '#fff' : 'var(--neutral-700)',
                        border: 'none',
                        minWidth: '70px',
                      }}
                      onClick={() => handleToggleDevice(fan)}
                    >
                      <Power size={14} /> {isOn ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {/* Fan Speed Buttons 1 to 5 */}
                  <div style={{ marginTop: '1rem' }}>
                    <div className="flex-between text-xs" style={{ marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-700)' }}>Speed Setting:</span>
                      <strong>Speed {fan.speed}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {[1, 2, 3, 4, 5].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          disabled={!isOn}
                          className="btn-badge"
                          style={{
                            flex: 1,
                            padding: '0.4rem 0',
                            background: fan.speed === lvl && isOn ? '#0284c7' : '#f1f5f9',
                            color: fan.speed === lvl && isOn ? '#fff' : '#475569',
                            fontWeight: fan.speed === lvl ? 700 : 500,
                            cursor: isOn ? 'pointer' : 'not-allowed',
                          }}
                          onClick={() => handleSpeedChange(fan, lvl)}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hardware Status Indicator & Physical Switch Simulator */}
                  <div className="flex-between" style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px dashed #e2e8f0' }}>
                    {renderHardwareStatus(fan)}

                    <button
                      type="button"
                      className="btn-link text-xs"
                      onClick={() => handleSimulatePhysicalSwitch(fan, 'speed regulator')}
                      title="Simulate someone changing speed/switch at physical wall regulator (Test Mode)"
                    >
                      Regulator Simulator (Test Mode)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. AIR CONDITIONER & PROJECTOR & CAMERA (Admin & Substitute Admin Only, or disabled for students) */}
      <div className="grid-2">
        {/* Air Conditioner */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Wind size={20} style={{ color: '#0d9488' }} /> Air Conditioner
            </h3>
            {isStudent && <span className="badge badge-neutral"><Lock size={12} /> Admin Only</span>}
          </div>
          <div className="card-body">
            {acs.map((ac) => {
              const isOn = ac.actualState === 'ON';
              return (
                <div key={ac.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="flex-between">
                    <div>
                      <strong>{ac.name}</strong>
                      <div className="text-xs text-muted">{ac.location}</div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${isOn ? 'btn-success' : 'btn-secondary'} btn-sm`}
                      disabled={isStudent}
                      onClick={() => handleToggleDevice(ac)}
                    >
                      <Power size={14} /> {isOn ? 'RUNNING' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex-between" style={{ background: 'var(--neutral-50)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                    <span className="text-sm">Target Temperature:</span>
                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
                      {ac.temperature || 24}°C
                    </span>
                  </div>

                  <div className="text-xs text-muted">
                    Mode: <strong>{ac.mode || 'Cooling'}</strong> • Confirmed state: {ac.actualState}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Projector & Camera */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Tv size={20} style={{ color: '#8b5cf6' }} /> Presentation Projector & Camera
            </h3>
            {isStudent && <span className="badge badge-neutral"><Lock size={12} /> Admin Only</span>}
          </div>
          <div className="card-body">
            {projectors.map((proj) => {
              const isOn = proj.actualState === 'ON';
              return (
                <div key={proj.id} style={{ marginBottom: '1.25rem' }}>
                  <div className="flex-between">
                    <div>
                      <strong>{proj.name}</strong>
                      <div className="text-xs text-muted">{proj.location}</div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${isOn ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                      disabled={isStudent}
                      onClick={() => handleToggleDevice(proj)}
                    >
                      <Power size={14} /> {isOn ? 'PROJECTING' : 'OFF'}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Camera View */}
            {cameras.map((cam) => (
              <div key={cam.id} style={{ borderTop: '1px solid var(--neutral-200)', paddingTop: '1rem' }}>
                <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Camera size={16} />
                    <strong className="text-sm">{cam.name}</strong>
                  </div>
                  <span className="badge badge-success">Online Feed</span>
                </div>
                <div style={{ height: '140px', background: '#0f172a', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  <span>ESP32-CAM Stream Preview (Active)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. POWER CONSUMPTION & ELECTRICITY COST MONITORING (Strictly Admin & Substitute Admin Only!) */}
      {isAdminOrSubstitute && powerStats && (
        <div className="card" style={{ marginTop: '1.5rem', border: '1px solid #c7d2fe', background: '#f5f3ff' }}>
          <div className="card-header" style={{ background: '#ede9fe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <Zap size={22} style={{ color: '#6d28d9' }} />
              <div>
                <h3 className="card-title" style={{ color: '#4c1d95' }}>
                  Lab Power Consumption & Electricity Cost Monitoring
                </h3>
                <p className="text-xs text-muted">
                  Administrative private analytics. Tariff: ₹{powerStats.tariffPerKwh} / kWh.
                </p>
              </div>
            </div>
            <span className="badge badge-primary">Admin & Substitute Only</span>
          </div>

          <div className="card-body">
            {/* Total Lab Power KPI Cards */}
            <div className="stats-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="stat-card" style={{ background: '#fff' }}>
                <div className="stat-card-left">
                  <span className="stat-label">Today's Consumption</span>
                  <span className="stat-value">{powerStats.totalDailyKwh} <small style={{ fontSize: '1rem' }}>kWh</small></span>
                  <span className="stat-subtext">Estimated: ₹{(powerStats.totalDailyKwh * powerStats.tariffPerKwh).toFixed(2)}</span>
                </div>
              </div>

              <div className="stat-card" style={{ background: '#fff' }}>
                <div className="stat-card-left">
                  <span className="stat-label">This Week</span>
                  <span className="stat-value">{powerStats.totalWeeklyKwh} <small style={{ fontSize: '1rem' }}>kWh</small></span>
                  <span className="stat-subtext">Estimated: ₹{(powerStats.totalWeeklyKwh * powerStats.tariffPerKwh).toFixed(2)}</span>
                </div>
              </div>

              <div className="stat-card" style={{ background: '#fff' }}>
                <div className="stat-card-left">
                  <span className="stat-label">This Month</span>
                  <span className="stat-value">{powerStats.totalMonthlyKwh} <small style={{ fontSize: '1rem' }}>kWh</small></span>
                  <span className="stat-subtext" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    Est. Bill: ₹{powerStats.totalEstimatedCostMonthly || powerStats.estimatedMonthlyCostInr || 0}
                  </span>
                </div>
              </div>

              <div className="stat-card" style={{ background: '#fff' }}>
                <div className="stat-card-left">
                  <span className="stat-label">Year to Date</span>
                  <span className="stat-value">{powerStats.totalYearlyKwh} <small style={{ fontSize: '1rem' }}>kWh</small></span>
                  <span className="stat-subtext">Cumulative energy draw</span>
                </div>
              </div>
            </div>

            {/* Per-Device Consumption Table */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: '#4c1d95' }}>
              Device-by-Device Energy Breakdown:
            </h4>
            <div className="table-responsive">
              <table className="table" style={{ background: '#fff', borderRadius: 'var(--radius-md)' }}>
                <thead>
                  <tr>
                    <th>Device Name</th>
                    <th>Location</th>
                    <th>Rated Watts</th>
                    <th>Today (kWh)</th>
                    <th>This Week (kWh)</th>
                    <th>This Month (kWh)</th>
                    <th>Est. Monthly Cost (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(powerStats.devices || powerStats.deviceStats || []).map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td className="text-sm text-muted">{d.location}</td>
                      <td>{d.powerRatingWatts} W</td>
                      <td>{d.dailyKwh}</td>
                      <td>{d.weeklyKwh}</td>
                      <td style={{ fontWeight: 700 }}>{d.monthlyKwh}</td>
                      <td style={{ fontWeight: 700, color: '#6d28d9' }}>
                        ₹{d.estimatedCostMonthly || d.estimatedMonthlyCostInr || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
