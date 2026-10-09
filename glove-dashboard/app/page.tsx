'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bluetooth, CalendarClock, Check, ChevronRight, CircleAlert, Clock3, FileText, Gauge, Hand, KeyRound, LockKeyhole, LogOut, Power, Radio, RefreshCw, Rotate3D, ShieldCheck, SlidersHorizontal, Target, User, Users, Wifi, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ExerciseGame } from '@/components/exercise-game';
import { ExerciseSession, type SessionSummary } from '@/components/exercise-session';
import { HandStateInspector } from '@/components/handstate-inspector';
import { LiveHandRig } from '@/components/live-hand-rig';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

type Vector3 = { x: number; y: number; z: number };
type Quaternion = Vector3 & { w: number };
type Joint = { name: string; position: Vector3; orientation: Quaternion };
type CalibrationState = { header: Record<string, string | number>; label: string; status: number; progress: number };
type HandState = { orientation?: { header: Record<string, string | number>; accelerometer: Vector3; orientation: Quaternion } | null; controller?: { header: Record<string, string | number>; inputs: Record<string, number> } | null; sliders?: Record<string, number>; kinematic?: { header: Record<string, string | number>; joints: Joint[] } | null; gesture_state?: unknown; articulation_state?: CalibrationState | null; tracker_offset_calibration?: unknown; tracker_offset?: unknown; tracker_location?: unknown; tracker_source?: unknown; button_passthrough?: unknown };
type ExerciseMode = 'none' | 'pronation_supination' | 'circumduction' | 'hand_open_close';
type ActiveExercise = Exclude<ExerciseMode, 'none'>;
type ExerciseEvent = { movement: string; timestamp_ms: number };
type ExerciseState = { selected: ExerciseMode; activity: string; latest: ExerciseEvent | null; counts: Record<string, number>; events: ExerciseEvent[]; pronation_supination: { state: string; angular_velocity: number; projected_rotation: number; direction_consistency: number; palm_dot_change: number }; circumduction: { state: string; score: number; loop_strength: number; average_velocity: number; signed_area: number }; hand_open_close: { state: string; raw_flexion: number; smoothed_flexion: number; confidence: number; open_threshold: number; close_threshold: number } };
type Telemetry = { meta: { connected: boolean; hand_connected?: { left: boolean; right: boolean }; hand_packet_age_ms?: { left: number | null; right: number | null }; packet_rate: number; packet_count: number; last_packet_age_ms: number | null; uptime_s: number; receive: string; last_packet: string; last_hand: string; sdk_version: string }; hands: { left: HandState; right: HandState }; exercises: { left: ExerciseState; right: ExerciseState } };
type LicenseResult = { valid: boolean; status: string; message: string; expires_at?: string; label?: string };
type XRGameLaunchResult = { status: 'idle' | 'launching' | 'started' | 'already_running' | 'stopping' | 'stopped' | 'not_running' | 'not_found' | 'partial' | 'error'; message: string };
type HandSide = 'LEFT' | 'RIGHT';
type CalibrationRequirement = { side: HandSide; state: CalibrationState | null; serial: string };
type ClinicalPatient = {
  id: string;
  name: string;
  username?: string;
  date_of_birth?: string;
  notes?: string;
  created_at?: string;
  avatar?: string;
  gender?: string;
  condition?: string;
  target_hand?: string;
  phone?: string;
  protocol?: string;
  functional_stage?: string;
};
type AuthState = { authenticated: boolean; doctor?: { id: string; name: string }; patient?: ClinicalPatient | null };
type ExerciseReport = { session_id: string; patient_id: string; exercise: ActiveExercise; hand: string; started_at: string; ended_at?: string; duration_seconds: number; total_repetitions: number; outcome: string; glove_serial?: string; counts?: Record<string, number>; score?: number };

const API = '';
const sliderKeys = ['THUMBBEND1', 'INDEXBEND1', 'MIDDLEBEND1', 'RINGBEND1', 'PINKYBEND1'];
const sliderNames = ['Thumb bend', 'Index bend', 'Middle bend', 'Ring bend', 'Pinky bend'];
const movementLabels: Record<string, string> = { pronation: 'Pronation', supination: 'Supination', clockwise: 'Clockwise circumduction', anticlockwise: 'Anticlockwise circumduction', wrist_open: 'Wrist open', wrist_close: 'Wrist close' };
const exerciseConfig: Record<ActiveExercise, { title: string; subtitle: string; icon: typeof Rotate3D; movements: string[]; guidance: string; steps: [string, string]; gameBadge: string }> = {
  pronation_supination: { title: 'Pronation / Supination', subtitle: 'Controlled forearm rotational mobility', icon: Rotate3D, movements: ['pronation', 'supination'], guidance: 'Stabilize your elbow against your side. Smoothly rotate your forearm from palm facing down (pronation) through neutral to palm facing up (supination).', steps: ['PALM DOWN (PRONATION)', 'PALM UP (SUPINATION)'], gameBadge: 'Rotational ROM Protocol' },
  circumduction: { title: 'Wrist Circumduction', subtitle: 'Smooth 360° circular wrist articulation', icon: Activity, movements: ['clockwise', 'anticlockwise'], guidance: 'Keep your forearm resting stable and guide your hand in smooth, wide circular rotations using only wrist articulation.', steps: ['CLOCKWISE ROTATION', 'ANTICLOCKWISE ROTATION'], gameBadge: 'Circumduction Protocol' },
  hand_open_close: { title: 'Wrist Open / Close', subtitle: 'Active grasp closure and finger extension', icon: Hand, movements: ['wrist_open', 'wrist_close'], guidance: 'Flex fingers inward into a firm, comfortable fist (grasp closure), then fully extend all fingers and thumb into an open hand (finger extension).', steps: ['CLOSE FIST (GRASP)', 'OPEN HAND (EXTEND)'], gameBadge: 'Grasp & Extension Protocol' },
};

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="metric"><span>{label}</span><strong className={accent ? 'signal-text' : ''}>{value}</strong></div>;
}

function LicenseGate({ status, result, value, busy, onValue, onSubmit, onSkip }: { status: string; result: LicenseResult | null; value: string; busy: boolean; onValue: (value: string) => void; onSubmit: () => void; onSkip?: () => void }) {
  const expired = result?.status === 'expired';
  return <div className="access-overlay" role="dialog" aria-modal="true" aria-labelledby="license-title">
    <form className="access-card" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="access-mark">{expired ? <CalendarClock /> : <LockKeyhole />}</div>
      <span className="eyebrow">206 AI CLINICAL ACCESS</span>
      <h1 id="license-title">{expired ? 'Subscription expired' : status === 'checking' ? 'Checking your access' : 'Activate this workstation'}</h1>
      <p>{expired ? 'Your license period has ended. Renew the subscription to continue using glove exercises.' : 'Enter the license key supplied by your administrator. Access is checked locally for this test build.'}</p>
      {!expired && <><label htmlFor="license-key">LICENSE KEY</label><div className="license-input"><KeyRound /><Input id="license-key" autoComplete="off" spellCheck={false} value={value} onChange={(event) => onValue(event.target.value.toUpperCase())} placeholder="WIZIO-XXXX-XXXX-XXXX" disabled={busy || status === 'checking'} /></div></>}
      {result && !result.valid && <div className={`access-message ${expired ? 'expired' : ''}`}><CircleAlert />{result.message}</div>}
      {expired
        ? <Button type="button" onClick={() => { window.location.href = 'mailto:?subject=Wizio%20subscription%20renewal'; }}>Renew subscription</Button>
        : <>
            <Button type="submit" disabled={busy || status === 'checking'}>{busy ? 'Validating…' : status === 'checking' ? 'Checking…' : 'Activate application'}<ChevronRight /></Button>
            <Button type="button" variant="outline" style={{ marginTop: '8px', width: '100%', borderColor: '#cbd5e1', color: '#0284c7', backgroundColor: '#f8fafc' }} onClick={onSkip || onSubmit} disabled={busy || status === 'checking'}>Skip / Continue to Home →</Button>
          </>}
      <small><ShieldCheck /> The test license is validated by the local glove bridge.</small>
    </form>
  </div>;
}

function LoginGate({ kind, onLogin, onCancel }: { kind: 'doctor' | 'patient'; onLogin: (username: string, password: string) => Promise<string | null>; onCancel?: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const doctor = kind === 'doctor';
  return <div className="access-overlay" role="dialog" aria-modal="true" aria-labelledby={`${kind}-login-title`}>
    <form className="access-card clinical-login-card" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); setError(await onLogin(username, password) ?? ''); setBusy(false); }}>
      <div className="access-mark">{doctor ? <ShieldCheck /> : <User />}</div>
      <span className="eyebrow">{doctor ? 'CLINICIAN ACCESS' : 'PATIENT ACCESS'}</span>
      <h1 id={`${kind}-login-title`}>{doctor ? 'Doctor login' : 'Patient Portal Sign In'}</h1>
      <p>{doctor ? 'Sign in to view assigned patients, exercise guidance and rehabilitation reports.' : 'Enter the patient credentials assigned by the doctor.'}</p>
      <label htmlFor={`${kind}-username`}>USERNAME</label><div className="license-input"><User /><Input id={`${kind}-username`} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></div>
      <label className="password-label" htmlFor={`${kind}-password`}>PASSWORD</label><div className="license-input"><LockKeyhole /><Input id={`${kind}-password`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></div>
      {error && <div className="access-message"><CircleAlert />{error}</div>}
      <Button type="submit" disabled={busy || !username || !password}>{busy ? 'Signing in…' : `Sign in as ${kind}`}<ChevronRight /></Button>
      {doctor && !onCancel && <Button type="button" variant="outline" style={{ marginTop: '8px' }} onClick={() => void onLogin('doctor', 'doctor')}>Continue as Demo Doctor →</Button>}
      {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
    </form>
  </div>;
}

function DoctorExerciseCatalog({ doctorId, onSelectPatient, onPatientLogin }: { doctorId?: string; onSelectPatient: (id: string) => void; onPatientLogin: () => void }) {
  const [preview, setPreview] = useState<ActiveExercise>('pronation_supination');
  return <div className="therapy-workspace doctor-catalog"><DoctorPatientDirectory doctorId={doctorId} onSelectPatient={onSelectPatient} onPatientLogin={onPatientLogin} /><section className="exercise-library"><div className="section-heading"><div><span className="eyebrow">EXERCISE LIBRARY</span><h2>Preview rehabilitation exercises</h2><p>Select an exercise to review its instructions. Live tracking starts only after choosing a patient.</p></div><span className="selected-hand-label">DOCTOR PREVIEW</span></div>    <div className="exercise-cards">{(Object.keys(exerciseConfig) as ActiveExercise[]).map((mode, index) => {
      const config = exerciseConfig[mode];
      const Icon = config.icon;
      const isPreviewing = preview === mode;
      return (
        <button type="button" key={mode} className={`exercise-card-btn ${isPreviewing ? 'selected' : ''}`} onClick={() => setPreview(mode)}>
          <div className="exercise-card-left">
            <div className="exercise-card-header">
              <Icon />
              <span className="exercise-number">0{index + 1}</span>
            </div>
            <div className="exercise-card-body">
              <strong>{config.title}</strong>
              <small>{config.subtitle}</small>
              <span className="clinical-badge-tag">{config.gameBadge}</span>
            </div>
            <i>{isPreviewing ? <><Check /> PREVIEWING</> : <><ChevronRight /> PREVIEW →</>}</i>
          </div>
          <div className="exercise-card-rig-preview">
            <LiveHandRig side="RIGHT" guidanceMode={mode} />
            <span className="rig-preview-tag">{mode === 'pronation_supination' ? '3D ROTATION' : mode === 'circumduction' ? '3D CIRCUMDUCTION' : '3D EXTENSION / GRASP'}</span>
          </div>
        </button>
      );
    })}</div></section><GuidancePanel mode={preview} side="RIGHT" /></div>;
}

const DEFAULT_AVATAR = '/patients/default_avatar.png';

function getPatientDisplayAvatar(patient?: Partial<ClinicalPatient> | null): string {
  if (!patient) return DEFAULT_AVATAR;
  const av = patient.avatar;
  if (av && (av.startsWith('data:image/') || av.startsWith('http://') || av.startsWith('https://') || (av.startsWith('/') && !av.includes('avatar-')))) {
    return av;
  }
  return DEFAULT_AVATAR;
}

function PatientModal({
  initialPatient,
  onCreated,
  onUpdated,
  onCancel,
}: {
  initialPatient?: ClinicalPatient | null;
  onCreated?: (patient: ClinicalPatient) => void;
  onUpdated?: (patient: ClinicalPatient) => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(initialPatient && initialPatient.id);
  const [form, setForm] = useState({
    name: initialPatient?.name || '',
    username: initialPatient?.username || '',
    password: '',
    date_of_birth: initialPatient?.date_of_birth || '',
    gender: initialPatient?.gender || 'Female',
    phone: initialPatient?.phone || '',
    condition: initialPatient?.condition || 'Post-Stroke Left Hemiparesis',
    target_hand: initialPatient?.target_hand || 'right',
    protocol: initialPatient?.protocol || 'Active Pronation / Supination',
    functional_stage: initialPatient?.functional_stage || 'Brunnstrom Stage IV - Moderate Spasticity',
    notes: initialPatient?.notes || '',
    avatar: initialPatient?.avatar || '',
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const startCamera = async () => {
    setCameraError('');
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Camera API is not supported on this browser or origin.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      setCameraError('Camera access was blocked or device not found.');
      setCameraActive(false);
    }
  };

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const canvas = document.createElement('canvas');
      const size = 320;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const minDim = Math.min(vw, vh);
        const sx = (vw - minDim) / 2;
        const sy = (vh - minDim) / 2;
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        update('avatar', dataUrl);
      }
    } catch (err) {
      console.error('Camera capture error', err);
    }
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        update('avatar', String(ev.target.result));
        stopCamera();
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const url = isEdit ? `/api/patients/${initialPatient?.id}` : '/api/patients';
      const method = isEdit ? 'PUT' : 'POST';
      const payload: Record<string, string> = { ...form };
      if (isEdit && !payload.password) {
        delete payload.password;
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { patient?: ClinicalPatient; detail?: string };
      if (!res.ok || !data.patient) {
        setError(data.detail || 'Failed to save patient profile.');
      } else {
        stopCamera();
        if (isEdit && onUpdated) onUpdated(data.patient);
        else if (onCreated) onCreated(data.patient);
      }
    } catch {
      setError('Patient service unavailable.');
    } finally {
      setBusy(false);
    }
  };

  const currentAvatarSrc = getPatientDisplayAvatar(form);
  const hasCustomPhoto = Boolean(form.avatar && (form.avatar.startsWith('data:image/') || (form.avatar.startsWith('/') && form.avatar !== DEFAULT_AVATAR)));

  return (
    <div className="patient-pc-modal-overlay" role="dialog" aria-modal="true">
      <div className="patient-pc-modal-card">
        <div className="patient-pc-modal-header">
          <div className="patient-pc-modal-title-group">
            <div className="patient-pc-modal-icon-badge">
              <User />
            </div>
            <div>
              <h2>{isEdit ? `Edit Patient Profile · ${initialPatient?.id}` : 'Register New Patient'}</h2>
              <p>{isEdit ? 'Update clinical rehabilitation parameters, target hand, and biometric photo.' : 'Configure patient credentials, biometric photo, and prescribed neuro protocols.'}</p>
            </div>
          </div>
          <button type="button" className="patient-pc-modal-close-btn" onClick={() => { stopCamera(); onCancel(); }}>
            ✕
          </button>
        </div>

        <form id="patient-pc-form" onSubmit={handleSubmit} className="patient-pc-modal-body">
          <div className="patient-pc-avatar-panel">
            {cameraActive ? (
              <div className="patient-pc-webcam-box">
                <video ref={videoRef} autoPlay playsInline muted />
                <div className="patient-pc-webcam-overlay">
                  <span>Align Face in Frame</span>
                </div>
              </div>
            ) : (
              <div className="patient-pc-avatar-preview">
                <img src={currentAvatarSrc} alt={form.name || 'Patient Avatar'} />
              </div>
            )}

            {cameraActive ? (
              <div className="patient-pc-action-btn-group">
                <button type="button" className="patient-pc-snap-btn" onClick={capturePhoto}>
                  📸 Capture Photo
                </button>
                <button type="button" className="patient-pc-upload-btn" onClick={stopCamera}>
                  Turn Off Camera
                </button>
              </div>
            ) : (
              <div className="patient-pc-action-btn-group">
                <button type="button" className="patient-pc-camera-btn" onClick={startCamera}>
                  📷 Take Photo with Laptop Camera
                </button>
                <label className="patient-pc-upload-btn">
                  📁 Upload Photo from PC
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                </label>
                {hasCustomPhoto && (
                  <button type="button" className="patient-pc-remove-btn" onClick={() => update('avatar', '')}>
                    ✕ Reset to Default Avatar
                  </button>
                )}
              </div>
            )}

            {cameraError && (
              <div style={{ color: '#e11d48', fontSize: '11px', textAlign: 'center', margin: '4px 0 8px 0', lineHeight: 1.3 }}>
                {cameraError}
              </div>
            )}
          </div>

          <div className="patient-pc-form-panel">
            <div className="patient-pc-section">
              <div className="patient-pc-section-header">
                1. Patient Identity & Credentials
              </div>
              <div className="patient-pc-grid-2">
                <div className="patient-pc-field">
                  <label>Full Name *</label>
                  <input value={form.name} onChange={e => update('name', e.target.value)} required placeholder="e.g. Eleanor Vance" />
                </div>
                <div className="patient-pc-field">
                  <label>Biological Sex</label>
                  <select value={form.gender} onChange={e => update('gender', e.target.value)}>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>
              <div className="patient-pc-grid-2" style={{ marginTop: '14px' }}>
                <div className="patient-pc-field">
                  <label>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} />
                </div>
                <div className="patient-pc-field">
                  <label>Contact Phone</label>
                  <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+1 (555) 000-0000" />
                </div>
              </div>
              <div className="patient-pc-grid-2" style={{ marginTop: '14px' }}>
                <div className="patient-pc-field">
                  <label>{isEdit ? 'Username (System ID)' : 'Portal Username *'}</label>
                  <input value={form.username} onChange={e => update('username', e.target.value)} required={!isEdit} disabled={isEdit} placeholder="patient_login" />
                </div>
                <div className="patient-pc-field">
                  <label>{isEdit ? 'Update Password (Optional)' : 'Temporary Password *'}</label>
                  <input type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder={isEdit ? 'Leave blank to keep unchanged' : 'Min 4 characters'} minLength={isEdit ? 0 : 4} required={!isEdit} />
                </div>
              </div>
            </div>

            <div className="patient-pc-section">
              <div className="patient-pc-section-header">
                2. Neurological Rehabilitation Prescription
              </div>
              <div className="patient-pc-grid-2">
                <div className="patient-pc-field">
                  <label>Primary Diagnosis / Condition *</label>
                  <select value={form.condition} onChange={e => update('condition', e.target.value)}>
                    <option value="Post-Stroke Left Hemiparesis">Post-Stroke Left Hemiparesis</option>
                    <option value="Post-Stroke Right Hemiparesis">Post-Stroke Right Hemiparesis</option>
                    <option value="Radial Nerve Injury & Extensor Paresis">Radial Nerve Injury & Extensor Paresis</option>
                    <option value="Carpal Tunnel Syndrome (Post-Op)">Carpal Tunnel Syndrome (Post-Op)</option>
                    <option value="Traumatic Brain Injury Rehabilitation">Traumatic Brain Injury Rehabilitation</option>
                    <option value="Parkinsonian Tremor & Bradykinesia">Parkinsonian Tremor & Bradykinesia</option>
                    <option value="Spinal Cord Injury (Cervical Motor Deficit)">Spinal Cord Injury (Cervical Motor Deficit)</option>
                    <option value="Cerebral Palsy (Upper Limb Spasticity)">Cerebral Palsy (Upper Limb Spasticity)</option>
                    <option value="General Neuro-Motor Deficit">General Neuro-Motor Deficit</option>
                  </select>
                </div>
                <div className="patient-pc-field">
                  <label>Target / Affected Hand *</label>
                  <select value={form.target_hand} onChange={e => update('target_hand', e.target.value)}>
                    <option value="right">Right Hand</option>
                    <option value="left">Left Hand</option>
                    <option value="both">Bilateral (Both Hands)</option>
                  </select>
                </div>
              </div>
              <div className="patient-pc-grid-2" style={{ marginTop: '14px' }}>
                <div className="patient-pc-field">
                  <label>Prescribed Protocol *</label>
                  <select value={form.protocol} onChange={e => update('protocol', e.target.value)}>
                    <option value="Active Pronation / Supination">Active Pronation / Supination</option>
                    <option value="Wrist Circumduction & Finger Tracking">Wrist Circumduction & Finger Tracking</option>
                    <option value="Wrist Open / Close & Tendon Gliding">Wrist Open / Close & Tendon Gliding</option>
                    <option value="Bilateral Active Grasp & Extension">Bilateral Active Grasp & Extension</option>
                    <option value="Fine Motor Agility Protocol">Fine Motor Agility Protocol</option>
                    <option value="Upper-Limb Motor Recovery">Upper-Limb Motor Recovery</option>
                  </select>
                </div>
                <div className="patient-pc-field">
                  <label>Functional Impairment Stage</label>
                  <select value={form.functional_stage} onChange={e => update('functional_stage', e.target.value)}>
                    <option value="Brunnstrom Stage IV - Moderate Spasticity">Brunnstrom Stage IV - Moderate Spasticity</option>
                    <option value="Brunnstrom Stage III - Synergy Dominant">Brunnstrom Stage III - Synergy Dominant</option>
                    <option value="Brunnstrom Stage V - Movement Isolation">Brunnstrom Stage V - Movement Isolation</option>
                    <option value="Emerging Wrist Extensor Recovery (Grade 3+)">Emerging Wrist Extensor Recovery (Grade 3+)</option>
                    <option value="Mild Sensory Deficit / Good Active ROM">Mild Sensory Deficit / Good Active ROM</option>
                    <option value="High Contracture Risk">High Contracture Risk</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="patient-pc-section">
              <div className="patient-pc-section-header">
                3. Clinical Notes & Therapy Precautions
              </div>
              <div className="patient-pc-field">
                <textarea
                  value={form.notes}
                  onChange={e => update('notes', e.target.value)}
                  placeholder="Document therapeutic baseline, spasticity observations, or range-of-motion precautions..."
                />
              </div>
            </div>
          </div>
        </form>

        <div className="patient-pc-modal-footer">
          {error ? (
            <div className="patient-pc-footer-error">
              <CircleAlert />
              {error}
            </div>
          ) : <div />}
          <div className="patient-pc-footer-btns">
            <button type="button" className="patient-pc-cancel-btn" onClick={() => { stopCamera(); onCancel(); }}>
              Cancel
            </button>
            <button
              type="submit"
              form="patient-pc-form"
              disabled={busy || !form.name || (!isEdit && (!form.username || form.password.length < 4))}
              className="patient-pc-submit-btn"
            >
              {busy ? 'Saving...' : isEdit ? 'Save Changes' : 'Register Patient'}
              <ChevronRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorPatientDirectory({ doctorId, onSelectPatient, onPatientLogin }: { doctorId?: string; onSelectPatient: (id: string) => void; onPatientLogin: () => void }) {
  const [patients, setPatients] = useState<ClinicalPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [editingPatient, setEditingPatient] = useState<ClinicalPatient | null>(null);

  useEffect(() => {
    // Ensure XR Game background plugin is invoked when opening dashboard
    fetch('/api/xr-game/launch', { method: 'POST' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!doctorId) { setPatients([]); setLoading(true); return; }
    let disposed = false;
    setLoading(true);
    fetch('/api/patients').then(async (response) => await response.json() as { patients?: ClinicalPatient[] }).then((data) => { if (!disposed) setPatients(data.patients ?? []); }).catch(() => undefined).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [doctorId]);

  return <>
    <section className="doctor-patient-directory">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CLINICAL PATIENT DIRECTORY</span>
          <h2>Select Patient Profile</h2>
          <p>Select an assigned patient profile to access prescribed neuro-motor therapy protocols and clinical data.</p>
        </div>
        <div className="report-heading-actions">
          <Button className="btn-add-patient" onClick={() => setShowAddPatient(true)}>
            <User />Register Patient
          </Button>
          <Button variant="outline" className="btn-patient-login" onClick={onPatientLogin}>
            <LockKeyhole />Patient Portal Sign In
          </Button>
        </div>
      </div>
      <div className="doctor-patient-grid">
        {loading ? (
          <div className="patient-directory-empty">Loading patients…</div>
        ) : patients.length === 0 ? (
          <div className="patient-directory-empty">
            <Users />
            <strong>No Patient Records Found</strong>
            <span>Register a new patient record to initiate rehabilitation.</span>
          </div>
        ) : patients.map((patient) => {
          let ageStr = '';
          if (patient.date_of_birth) {
            const birthYear = parseInt(patient.date_of_birth.split('-')[0]);
            if (!isNaN(birthYear)) ageStr = ` · ${2026 - birthYear} yrs`;
          }
          const summaryNotes = patient.notes || 'Prescribed StretchSense MoCap glove rehabilitation protocols.';
          const avatarSrc = getPatientDisplayAvatar(patient);
          const handLabel = patient.target_hand === 'left' ? 'Target: Left Hand' : patient.target_hand === 'both' ? 'Target: Bilateral' : 'Target: Right Hand';

          return (
            <div key={patient.id} className="patient-card-large" onClick={() => onSelectPatient(patient.id)}>
              <div className="patient-card-left">
                <div className="patient-badge-row">
                  <span className="patient-id-badge">{patient.id}</span>
                  <span className="patient-status-badge">● Active</span>
                  {patient.condition && <span className="patient-clinical-badge">{patient.condition}</span>}
                  <span className="patient-hand-badge">{handLabel}</span>
                </div>
                <h3 className="patient-name">{patient.name}</h3>
                <div className="patient-meta-text">
                  DOB: {patient.date_of_birth || 'N/A'}{ageStr}
                  {patient.gender ? ` · ${patient.gender}` : ''}
                  {patient.phone ? ` · ${patient.phone}` : ''}
                </div>
                <p className="patient-notes-desc">{summaryNotes}</p>
                <div className="patient-card-actions">
                  <button
                    type="button"
                    className="patient-workspace-btn"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectPatient(patient.id);
                    }}
                  >
                    Open Workspace
                  </button>
                  <button
                    type="button"
                    className="patient-edit-btn"
                    title="Edit Patient Profile"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditingPatient(patient);
                    }}
                  >
                    ✏ Edit Profile
                  </button>
                </div>
              </div>
              <div className="patient-card-right">
                <div className="patient-photo-wrapper">
                  <img src={avatarSrc} alt={patient.name} className="patient-photo-img" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>

    {showAddPatient && (
      <PatientModal
        onCancel={() => setShowAddPatient(false)}
        onCreated={(patient) => {
          setPatients((current) => [...current, patient]);
          setShowAddPatient(false);
        }}
      />
    )}

    {editingPatient && (
      <PatientModal
        initialPatient={editingPatient}
        onCancel={() => setEditingPatient(null)}
        onUpdated={(patient) => {
          setPatients((current) => current.map((p) => p.id === patient.id ? patient : p));
          setEditingPatient(null);
        }}
      />
    )}
  </>;
}

function ReportCard({ report }: { report: ExerciseReport }) {
  const movements = Object.entries(report.counts ?? {}).filter(([, count]) => count > 0);
  const maximum = Math.max(1, ...movements.map(([, count]) => count));
  return <article className="session-report-card"><header><div><strong>{exerciseConfig[report.exercise]?.title ?? report.exercise}</strong><small>{new Date(report.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(report.started_at).toLocaleDateString()}</small></div><span className="outcome-badge">{report.outcome.toUpperCase()}</span></header><div className="report-summary"><b>{report.total_repetitions}</b><small>REPETITIONS</small><b>{formatDuration(report.duration_seconds)}</b><small>DURATION</small><b>{report.hand.toUpperCase()}</b><small>HAND</small>{typeof report.score === 'number' && report.score > 0 ? <><b>{report.score}</b><small>SCORE</small></> : null}</div>{movements.length > 0 && <div className="report-chart" aria-label="Movement repetition chart">{movements.map(([movement, count]) => <div key={movement}><span>{movement.replaceAll('_', ' ')}</span><i><u style={{ width: `${(count / maximum) * 100}%` }} /></i><b>{count}</b></div>)}</div>}<footer>{report.glove_serial || 'StretchSense S9001 (Calibrated)'}</footer></article>;
}

function reportDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function ReportAnalytics({ reports }: { reports: ExerciseReport[] }) {
  const validReports = reports.length > 0 ? reports : [];
  const totalRepetitions = validReports.reduce((sum, report) => sum + (report.total_repetitions || 0), 0);
  const totalDuration = validReports.reduce((sum, report) => sum + (report.duration_seconds || 0), 0);
  const averageRepetitions = validReports.length ? Math.round(totalRepetitions / validReports.length) : 0;
  const dayMap = new Map<string, ExerciseReport[]>();
  for (const report of validReports) {
    const key = reportDateKey(report.started_at);
    dayMap.set(key, [...(dayMap.get(key) ?? []), report]);
  }
  const days = [...dayMap.entries()].map(([date, sessions]) => ({
    date,
    label: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    longLabel: new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    sessions,
    repetitions: sessions.reduce((sum, report) => sum + (report.total_repetitions || 0), 0),
    duration: sessions.reduce((sum, report) => sum + (report.duration_seconds || 0), 0),
  })).sort((a, b) => b.date.localeCompare(a.date));
  const exerciseTotals = (Object.keys(exerciseConfig) as ActiveExercise[]).map((exercise) => ({
    exercise,
    title: exerciseConfig[exercise].title,
    repetitions: validReports.filter((report) => report.exercise === exercise).reduce((sum, report) => sum + (report.total_repetitions || 0), 0),
    sessions: validReports.filter((report) => report.exercise === exercise).length,
  }));
  const maximumExercise = Math.max(1, ...exerciseTotals.map((item) => item.repetitions));
  const trend = [...days].reverse().map((day) => ({ date: day.label, repetitions: day.repetitions }));
  return <div className="report-analytics"><div className="report-kpis"><article><FileText /><span><small>COMPLETED THERAPY SESSIONS</small><strong>{validReports.length}</strong><em>sessions with recorded movement</em></span></article><article><Target /><span><small>CUMULATIVE REPETITIONS</small><strong>{totalRepetitions}</strong><em>{averageRepetitions} repetitions per session</em></span></article><article><Clock3 /><span><small>CUMULATIVE THERAPY TIME</small><strong>{formatDuration(totalDuration)}</strong><em>measured exercise time</em></span></article><article><CalendarClock /><span><small>TREATMENT ADHERENCE</small><strong>{days.length}</strong><em>dates with completed sessions</em></span></article></div><div className="report-insights"><section><header><div><strong>Longitudinal Activity Trend</strong><small>Successful repetitions by treatment date</small></div><span>{days.length} TREATMENT ADHERENCE</span></header><ChartContainer config={{ repetitions: { label: 'Repetitions', color: '#0877da' } }} className="daily-report-chart"><BarChart data={trend} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent hideLabel />} /><Bar dataKey="repetitions" fill="var(--color-repetitions)" radius={[5, 5, 0, 0]} /></BarChart></ChartContainer></section><section className="exercise-breakdown"><header><div><strong>Protocol Distribution</strong><small>Total movements and completed sessions</small></div></header>{exerciseTotals.map((item) => <div key={item.exercise}><span><b>{item.title}</b><small>{item.sessions} session{item.sessions === 1 ? '' : 's'}</small></span><i><u style={{ width: `${(item.repetitions / maximumExercise) * 100}%` }} /></i><strong>{item.repetitions}</strong></div>)}</section></div><section className="daily-report-groups"><header><div><strong>Longitudinal Treatment Record</strong><small>Sessions are grouped into one understandable daily record</small></div></header>{days.map((day, index) => <details key={day.date} open={index === 0}><summary><CalendarClock /><span><strong>{day.longLabel}</strong><small>{day.sessions.length} completed session{day.sessions.length === 1 ? '' : 's'}</small></span><b>{day.repetitions}<small>REPS</small></b><b>{formatDuration(day.duration)}<small>DURATION</small></b><ChevronRight /></summary><div>{day.sessions.map((report) => <ReportCard key={report.session_id} report={report} />)}</div></details>)}</section></div>;
}

function ReportsWorkspace({ activePatient }: { activePatient?: ClinicalPatient | null }) {
  const [patients, setPatients] = useState<ClinicalPatient[]>([]);
  const [reports, setReports] = useState<ExerciseReport[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState(activePatient?.id ?? '');
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchReports = useCallback((patientId: string) => {
    if (!patientId) { setReports([]); setLoadingReports(false); return; }
    setLoadingReports(true);
    fetch(`/api/reports?patient_id=${encodeURIComponent(patientId)}`)
      .then(async (response) => await response.json() as { reports?: ExerciseReport[] })
      .then((data) => { setReports(data.reports ?? []); })
      .catch(() => { setReports([]); })
      .finally(() => { setLoadingReports(false); });
  }, []);

  useEffect(() => {
    let disposed = false;
    fetch('/api/patients').then(async (response) => await response.json() as { patients?: ClinicalPatient[] }).then((data) => {
      if (!disposed) {
        const list = data.patients ?? [];
        setPatients(list);
        if (!selectedPatientId && list.length > 0) {
          setSelectedPatientId(activePatient?.id || list[0].id);
        }
      }
    }).catch(() => undefined).finally(() => { if (!disposed) setLoadingPatients(false); });
    return () => { disposed = true; };
  }, [activePatient?.id, selectedPatientId]);

  useEffect(() => {
    if (activePatient?.id) setSelectedPatientId(activePatient.id);
  }, [activePatient?.id]);

  useEffect(() => {
    fetchReports(selectedPatientId);
  }, [selectedPatientId, reloadKey, fetchReports]);

  const visiblePatients = activePatient ? patients.filter((patient) => patient.id === activePatient.id) : patients;
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) ?? activePatient ?? null;

  return <section className="reports-workspace">
    <div className="section-heading">
      <div>
        <span className="eyebrow">PATIENT REPORTS &amp; CLINICAL ANALYTICS</span>
        <h2>{selectedPatient ? `${selectedPatient.name}'s rehabilitation history` : 'Patients and reports'}</h2>
        <p>{selectedPatient ? `${selectedPatient.id}${selectedPatient.date_of_birth ? ` · Date of birth ${selectedPatient.date_of_birth}` : ''}${selectedPatient.condition ? ` · ${selectedPatient.condition}` : ''}` : 'Select Patient Profile to view their saved exercise data. This does not start a glove session.'}</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Button type="button" variant="outline" onClick={() => setReloadKey((k) => k + 1)} title="Refresh reports list">
          <RefreshCw className={loadingReports ? 'animate-spin' : ''} style={{ width: 14, height: 14 }} /> Refresh
        </Button>
        {reports.length > 0 && (
          <Button type="button" onClick={() => window.print()} title="Print / Export PDF" style={{ background: '#0F6C73', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileText style={{ width: 14, height: 14 }} /> Print Report
          </Button>
        )}
      </div>
    </div>
    <div className="report-layout">
      <aside className="patient-list">
        <h3><Users /> PATIENTS</h3>
        {loadingPatients ? <div className="patient-list-message">Loading patients…</div> : visiblePatients.map((patient) => <button type="button" key={patient.id} className={selectedPatientId === patient.id ? 'selected' : ''} onClick={() => setSelectedPatientId(patient.id)}><span>{patient.name.slice(0, 1).toUpperCase()}</span><div><strong>{patient.name}</strong><small>{patient.id}</small></div><ChevronRight /></button>)}
      </aside>
      <div className="report-list advanced-report-list">
        <h3><FileText /> {selectedPatient ? `${selectedPatient.name.toUpperCase()} · REPORTS` : 'AVAILABLE REPORTS'}</h3>
        {!selectedPatientId ? <div className="no-reports"><Users /><strong>Select Patient Profile</strong><span>Their reports and exercise history will appear here.</span></div> : loadingReports ? <div className="no-reports">Loading reports…</div> : reports.length === 0 ? <div className="no-reports"><FileText /><strong>No report available</strong><span>No completed exercise sessions with successful repetitions are stored for this patient.</span></div> : <ReportAnalytics reports={reports} />}
      </div>
    </div>
  </section>;
}

function ConnectionGate({ bridgeOnline, xrGame, anyGloveConnected, onConnect, onDisconnect, onBack }: { bridgeOnline: boolean; xrGame: XRGameLaunchResult; anyGloveConnected?: boolean; onConnect: () => void; onDisconnect: () => void; onBack: () => void }) {
  const processStarted = xrGame.status === 'started' || xrGame.status === 'already_running';
  const isConnecting = processStarted || xrGame.status === 'launching';
  const isStreaming = Boolean(anyGloveConnected);

  return <div className="access-overlay connection-overlay" role="dialog" aria-modal="true" aria-labelledby="connection-title">
    <div className="access-card connection-card">
      <div className="connection-animation"><i /><i /><i /><i /></div>
      <span className="eyebrow">GLOVE BRIDGE & CONNECTION</span>
      <h1 id="connection-title">Connect StretchSense Rehabilitation Gloves</h1>
      <p>Initiating Python gloves bridge, launching XR Game driver, and connecting StretchSense telemetry stream.</p>
      <div className="connection-steps">
        <div className={bridgeOnline ? 'done' : 'active'}>
          <b>{bridgeOnline ? <Check /> : <RefreshCw className="animate-spin" />}</b>
          <span><strong>Step 1 · Initiate Bridge</strong><small>{bridgeOnline ? 'Local telemetry bridge active' : 'Initiating bridge connection…'}</small></span>
        </div>
        <div className={processStarted ? 'done' : xrGame.status === 'launching' ? 'active' : ''}>
          <b>{processStarted ? <Check /> : xrGame.status === 'launching' ? <RefreshCw className="animate-spin" /> : '2'}</b>
          <span><strong>Step 2 · Launch XR Game App</strong><small>{processStarted ? 'XR Game app running' : xrGame.message || (xrGame.status === 'launching' ? 'Launching XR Game application…' : 'Waiting to launch XR Game…')}</small></span>
        </div>
        <div className={isStreaming ? 'done' : processStarted ? 'active' : ''}>
          <b>{isStreaming ? <Check /> : processStarted ? <RefreshCw className="animate-spin" /> : '3'}</b>
          <span><strong>Step 3 · Connect Gloves</strong><small>{isStreaming ? 'Gloves connected · Streaming telemetry' : processStarted ? 'Listening for glove telemetry… Turn on gloves' : 'Waiting for driver launch…'}</small></span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
        {processStarted ? (
          <Button type="button" style={{ background: '#0F6C73', color: '#ffffff', fontFamily: "'Montserrat', sans-serif", fontWeight: 600, padding: '0 20px', height: '42px', display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: 'none' }} disabled={xrGame.status === 'stopping'} onClick={onDisconnect}>
            <Power className="mr-2" style={{ color: '#ffffff', stroke: '#ffffff' }} /> {xrGame.status === 'stopping' ? 'Stopping…' : 'Disconnect gloves'}
          </Button>
        ) : (
          <Button type="button" style={{ background: '#0F6C73', color: '#ffffff', fontFamily: "'Montserrat', sans-serif", fontWeight: 600, padding: '0 20px', height: '42px', display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: 'none' }} disabled={!bridgeOnline || xrGame.status === 'stopping' || xrGame.status === 'launching'} onClick={onConnect}>
            <Bluetooth className="mr-2" style={{ color: '#ffffff', stroke: '#ffffff' }} /> {xrGame.status === 'launching' ? 'Launching…' : 'Connect gloves'}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel / Back to Doctor
        </Button>
      </div>
      {(xrGame.status === 'not_found' || xrGame.status === 'error' || xrGame.status === 'partial') && <div className="access-message"><CircleAlert />{xrGame.message}</div>}
      {processStarted && !isStreaming && <div className="waiting-strip"><RefreshCw className="animate-spin" /><span>XR Game running · waiting for StretchSense glove packets…</span></div>}
    </div>
  </div>;
}

function CalibrationGate({ requirements, exercise, pending, message, onCalibrate, onTare, onCancel }: { requirements: CalibrationRequirement[]; exercise: ActiveExercise; pending: 'calibration' | 'tare' | null; message: string; onCalibrate: (side: HandSide) => void; onTare?: (side: HandSide) => void; onCancel: () => void }) {
  return <div className="access-overlay calibration-overlay" role="dialog" aria-modal="true" aria-labelledby="calibration-title">
    <div className="access-card calibration-gate-card">
      <div className="access-mark"><Gauge /></div>
      <span className="eyebrow">GLOVE CALIBRATION REQUIRED</span>
      <h1 id="calibration-title">Calibrate Range of Motion Before Exercising</h1>
      <p>Your selected glove needs a completed Basic articulation calibration before starting {exerciseConfig[exercise].title}.</p>
      <div className="calibration-requirements">{requirements.map(({ side, state, serial }) => {
        const status = state?.status ?? 0;
        const progress = Math.max(0, Math.min(100, state?.progress ?? 0));
        const inProgress = status === 2 || status === 3;
        const isCalibrated = status === 4 || progress === 100;
        const statusText = status === 4 ? 'CALIBRATED (READY)' : status === 3 ? 'CAPTURING' : status === 2 ? 'GET READY' : status === 1 ? 'NOT CALIBRATED' : 'STATUS UNKNOWN';
        return <section key={side} className={`calibration-requirement status-${status}`}>
          <header><span><Bluetooth /><b>{side} GLOVE</b></span><strong>{statusText}</strong></header>
          <small>{serial || 'Connected glove'}</small>
          <div className="calibration-motion"><LiveHandRig side={side} guidanceMode="calibration" /><span>ANATOMICAL RANGE-OF-MOTION CALIBRATION</span></div>
          <div className="calibration-gate-progress"><div><span>BASIC CALIBRATION</span><b>{Math.round(progress)}%</b></div><i><u style={{ width: `${progress}%` }} /></i></div>
          <p>{inProgress ? 'Keep following the hand movement until capture reaches 100%.' : isCalibrated ? 'Calibration complete (100%). You may recalibrate or tare wrist if needed.' : 'Start with a relaxed closed fist, then steadily extend each digit through maximum comfortable range of motion.'}</p>
          <div className="calibration-gate-actions">
            <Button type="button" variant="outline" disabled={inProgress} onClick={onCancel}>Not now</Button>
            {onTare && <Button type="button" variant="outline" disabled={pending !== null || inProgress} onClick={() => onTare(side)}><Rotate3D />{pending === 'tare' ? 'Taring…' : 'Tare wrist'}</Button>}
            <Button type="button" disabled={pending !== null || inProgress} onClick={() => onCalibrate(side)}><Gauge />{pending === 'calibration' ? 'Starting…' : inProgress ? 'Calibration in progress…' : isCalibrated ? `Recalibrate ${side.toLowerCase()} glove` : `Start calibration`}</Button>
          </div>
        </section>;
      })}</div>
      {message && <div className="calibration-gate-message"><Radio />{message}</div>}
      <small><ShieldCheck /> Your selected exercise starts automatically when this glove reports CAPTURED.</small>
    </div>
  </div>;
}

function CalibrationControls({ side, hand, connected, bridgeOnline, onCommand, pending, message }: { side: 'LEFT' | 'RIGHT'; hand?: HandState; connected: boolean; bridgeOnline: boolean; onCommand: (action: 'articulation_basic_calibrate' | 'imu_tare', kind: 'calibration' | 'tare', side: 'LEFT' | 'RIGHT') => void; pending: 'calibration' | 'tare' | null; message: string }) {
  const articulation = hand?.articulation_state;
  const isBasicCalibration = articulation?.label?.trim().toUpperCase() === 'BASIC';
  const progress = Math.max(0, Math.min(100, isBasicCalibration ? articulation?.progress ?? 0 : 0));
  const isCalib = articulation?.status === 4 || progress === 100;
  const roll = typeof hand?.orientation?.orientation?.x === 'number' ? (hand.orientation.orientation.x * 100).toFixed(1) + '°' : '0.0°';
  const bend = typeof hand?.sliders?.INDEXBEND1 === 'number' ? Math.round(hand.sliders.INDEXBEND1 * 100) + '%' : (typeof hand?.sliders?.index_mcp === 'number' ? Math.round(hand.sliders.index_mcp * 100) + '%' : (connected ? 'Active' : '—'));

  return <div className="quick-controls">
    <div><span>CONTROL TARGET</span><strong>{side} GLOVE</strong><small>{connected ? 'Live telemetry available' : 'Not connected'}</small></div>
    {connected && <div className="quick-live-metrics" style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#94a3b8', padding: '4px 0', alignItems: 'center' }}>
      <span>ROLL: <b style={{ color: '#38bdf8' }}>{roll}</b></span>
      <span>BEND: <b style={{ color: '#38bdf8' }}>{bend}</b></span>
      <span style={{ color: isCalib ? '#10b981' : '#f59e0b', marginLeft: 'auto', fontWeight: 600 }}>{isCalib ? 'CALIBRATED' : 'UNCALIBRATED'}</span>
    </div>}
    <div className="quick-progress"><span>CALIBRATION</span><strong>{isCalib ? '100% (READY)' : `${Math.round(progress)}%`}</strong><i><b style={{ width: `${progress}%` }} /></i></div>
    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
      <Button style={{ flex: 1 }} disabled={!bridgeOnline || !connected || pending !== null} onClick={(event) => { event.stopPropagation(); onCommand('articulation_basic_calibrate', 'calibration', side); }}><Gauge />{pending === 'calibration' ? 'Starting…' : isCalib ? 'Recalibrate' : 'Calibrate'}</Button>
      <Button style={{ flex: 1 }} variant="outline" disabled={!bridgeOnline || !connected || pending !== null} onClick={(event) => { event.stopPropagation(); onCommand('imu_tare', 'tare', side); }}><Rotate3D />{pending === 'tare' ? 'Taring…' : 'Tare wrist'}</Button>
    </div>
    {message && <span className="quick-message">{message}</span>}
  </div>;
}

function DualHandPanel({ telemetry, selectedHand, onSelect, bridgeOnline, onCommand, pending, message }: { telemetry: Telemetry | null; selectedHand: 'LEFT' | 'RIGHT'; onSelect: (side: 'LEFT' | 'RIGHT') => void; bridgeOnline: boolean; onCommand: (action: 'articulation_basic_calibrate' | 'imu_tare', kind: 'calibration' | 'tare', side: 'LEFT' | 'RIGHT') => void; pending: 'calibration' | 'tare' | null; message: string }) {
  return <section className="dual-rig-panel">
    <div className="section-heading"><div><span className="eyebrow">LIVE HANDS</span><h2>Your movement, in real time</h2></div><span className="truth-label"><Radio /> LIVE SENSOR DATA</span></div>
    <div className="dual-rig-grid">{(['LEFT', 'RIGHT'] as const).map((side) => {
      const hand = telemetry?.hands[side.toLowerCase() as 'left' | 'right'];
      const connected = Boolean(telemetry?.meta.hand_connected?.[side.toLowerCase() as 'left' | 'right']);
      return <article key={side} className={`rig-card ${selectedHand === side ? 'selected' : ''}`} onClick={() => onSelect(side)}>
        <header><div><Bluetooth /><span><strong>{side} HAND</strong><small>{selectedHand === side ? 'EXERCISE TARGET' : 'SELECT THIS HAND'}</small></span></div><span className={`hand-status ${connected ? 'connected' : ''}`}><i />{connected ? 'CONNECTED' : 'NOT CONNECTED'}</span></header>
        <LiveHandRig side={side} joints={connected ? hand?.kinematic?.joints : undefined} />
        <CalibrationControls side={side} hand={hand} connected={connected} bridgeOnline={bridgeOnline} onCommand={onCommand} pending={selectedHand === side ? pending : null} message={selectedHand === side ? message : ''} />
      </article>;
    })}</div>
  </section>;
}

function GuidancePanel({ mode, side }: { mode: ActiveExercise; side: 'LEFT' | 'RIGHT' }) {
  const config = exerciseConfig[mode];
  return <section className="guidance-panel">
    <div className="guidance-copy"><span className="eyebrow">HOW TO PERFORM</span><h2>{config.title}</h2><p>{config.guidance}</p><div className="guidance-sequence"><span><b>01</b>{config.steps[0]}</span><i /><span><b>02</b>{config.steps[1]}</span></div><small>GUIDANCE ANIMATION · NOT MEASURED DATA</small></div>
    <div className="guidance-visual"><LiveHandRig side={side} guidanceMode={mode} /></div>
  </section>;
}

function DetectorDetails({ mode, exercise }: { mode: ActiveExercise; exercise?: ExerciseState }) {
  const movements = exerciseConfig[mode].movements;
  const events = exercise?.events.filter((event) => movements.includes(event.movement)) ?? [];
  return <div className="exercise-detail-grid">
    <article className="panel detector-panel"><div className="panel-heading"><div><Activity /><span><strong>DETECTOR SIGNAL</strong><small>Live stability and classification values</small></span></div><span className="live-tag">{exercise?.activity ?? 'idle'}</span></div>
      <div className="detector-metrics">{mode === 'pronation_supination' ? <><Metric label="ANGULAR VELOCITY" value={`${exercise?.pronation_supination.angular_velocity?.toFixed(1) ?? '—'}°/s`} /><Metric label="PROJECTED ROTATION" value={`${exercise?.pronation_supination.projected_rotation?.toFixed(1) ?? '—'}°`} /><Metric label="DIRECTION CONSISTENCY" value={exercise?.pronation_supination.direction_consistency?.toFixed(3) ?? '—'} /><Metric label="PALM DOT CHANGE" value={exercise?.pronation_supination.palm_dot_change?.toFixed(4) ?? '—'} /></> : mode === 'circumduction' ? <><Metric label="SMOOTHED SCORE" value={exercise?.circumduction.score?.toFixed(3) ?? '—'} /><Metric label="LOOP STRENGTH" value={exercise?.circumduction.loop_strength?.toFixed(3) ?? '—'} /><Metric label="AVERAGE VELOCITY" value={`${exercise?.circumduction.average_velocity?.toFixed(1) ?? '—'}°/s`} /><Metric label="SIGNED AREA" value={exercise?.circumduction.signed_area?.toFixed(3) ?? '—'} /></> : <><Metric label="RAW FLEXION" value={exercise?.hand_open_close.raw_flexion?.toFixed(3) ?? '—'} /><Metric label="SMOOTHED FLEXION" value={exercise?.hand_open_close.smoothed_flexion?.toFixed(3) ?? '—'} /><Metric label="CONFIDENCE" value={exercise?.hand_open_close.confidence?.toFixed(3) ?? '—'} /><Metric label="CURRENT STATE" value={exercise?.hand_open_close.state?.toUpperCase() ?? '—'} /></>}</div>
    </article>
    <article className="panel"><div className="panel-heading"><div><Zap /><span><strong>DETECTED MOVEMENTS</strong><small>Newest confirmed movement first</small></span></div><span className="count-tag">{events.length} EVENTS</span></div><div className="exercise-events">{events.length ? events.map((event, index) => <div key={`${event.timestamp_ms}-${index}`}><i /><strong>{movementLabels[event.movement] ?? event.movement}</strong><span>{new Date(event.timestamp_ms).toLocaleTimeString()}</span></div>) : <p>Perform the selected movement to begin tracking.</p>}</div></article>
  </div>;
}

function ExerciseWorkspace({ telemetry, selectedHand, setSelectedHand, selectExercise, finishExercise, sendCommand, pendingCommand, commandStatus, bridgeOnline }: { telemetry: Telemetry | null; selectedHand: 'LEFT' | 'RIGHT'; setSelectedHand: (side: 'LEFT' | 'RIGHT') => void; selectExercise: (mode: ActiveExercise) => void; finishExercise: (summary?: SessionSummary) => void; sendCommand: (action: 'articulation_basic_calibrate' | 'imu_tare', kind: 'calibration' | 'tare', side: 'LEFT' | 'RIGHT') => void; pendingCommand: 'calibration' | 'tare' | null; commandStatus: string; bridgeOnline: boolean }) {
  const exercise = telemetry?.exercises[selectedHand.toLowerCase() as 'left' | 'right'];
  const selected = exercise?.selected ?? 'none';
  const selectedHandConnected = Boolean(telemetry?.meta.hand_connected?.[selectedHand.toLowerCase() as 'left' | 'right']);
  return <div className="therapy-workspace">
    <DualHandPanel telemetry={telemetry} selectedHand={selectedHand} onSelect={setSelectedHand} bridgeOnline={bridgeOnline} onCommand={sendCommand} pending={pendingCommand} message={commandStatus} />
    <section className="exercise-library"><div className="section-heading"><div><span className="eyebrow">EXERCISE LIBRARY</span><h2>Prescribed Neuro-Rehabilitation Protocols</h2><p>Selecting an exercise activates only that detector for the chosen glove.</p></div><div className="exercise-heading-actions"><span className="selected-hand-label">TARGET · {selectedHand}</span>{selected !== 'none' && <Button onClick={finishExercise}><Check />Finish & save</Button>}</div></div>
      <div className="exercise-cards">{(Object.keys(exerciseConfig) as ActiveExercise[]).map((mode, index) => {
        const config = exerciseConfig[mode];
        const Icon = config.icon;
        const active = selected === mode;
        return (
          <button type="button" key={mode} className={`exercise-card-btn ${active ? 'selected' : ''}`} onClick={() => selectExercise(mode)}>
            <div className="exercise-card-left">
              <div className="exercise-card-header">
                <Icon />
                <span className="exercise-number">0{index + 1}</span>
              </div>
              <div className="exercise-card-body">
                <strong>{config.title}</strong>
                <small>{config.subtitle}</small>
                <span className="clinical-badge-tag">{config.gameBadge}</span>
              </div>
              <i>{active ? <><Radio /> TRACKING</> : <><ChevronRight /> SELECT →</>}</i>
            </div>
            <div className="exercise-card-rig-preview">
              <LiveHandRig side={selectedHand} guidanceMode={mode} />
              <span className="rig-preview-tag">{mode === 'pronation_supination' ? '3D ROTATION' : mode === 'circumduction' ? '3D CIRCUMDUCTION' : '3D EXTENSION / GRASP'}</span>
            </div>
          </button>
        );
      })}</div>
    </section>
    {selected === 'none' ? <div className="exercise-placeholder"><Rotate3D /><strong>Select an exercise above</strong><span>Your live hands remain visible while the exercise guidance, camera feedback and gameplay area appear here.</span></div> : <ExerciseSession
      mode={selected}
      side={selectedHand}
      hand={telemetry?.hands[selectedHand.toLowerCase() as 'left' | 'right']}
      latest={exercise?.latest}
      guidance={<GuidancePanel mode={selected} side={selectedHand} />}
      tracker={<ExerciseGame mode={selected} exercise={exercise} live={Boolean(telemetry?.meta.connected)} side={selectedHand} />}
      details={<DetectorDetails mode={selected} exercise={exercise} />}
      onFinish={finishExercise}
      onTare={() => sendCommand('imu_tare', 'tare', selectedHand)}
      tarePending={pendingCommand === 'tare'}
      tareDisabled={!bridgeOnline || !selectedHandConnected || pendingCommand !== null}
      tareStatus={commandStatus}
    />}
  </div>;
}

function LiveDataWorkspace({ telemetry, selectedHand, setSelectedHand, bridgeOnline, sendCommand, pendingCommand, commandStatus }: { telemetry: Telemetry | null; selectedHand: 'LEFT' | 'RIGHT'; setSelectedHand: (side: 'LEFT' | 'RIGHT') => void; bridgeOnline: boolean; sendCommand: (action: 'articulation_basic_calibrate' | 'imu_tare', kind: 'calibration' | 'tare', side: 'LEFT' | 'RIGHT') => void; pendingCommand: 'calibration' | 'tare' | null; commandStatus: string }) {
  const hand = telemetry?.hands[selectedHand.toLowerCase() as 'left' | 'right'];
  const orientation = hand?.orientation?.orientation;
  const acceleration = hand?.orientation?.accelerometer;
  const accelValues = useMemo(() => acceleration ? [acceleration.x, acceleration.y, acceleration.z] : [], [acceleration]);
  const accelMax = Math.max(1, ...accelValues.map((value) => Math.abs(value)));
  const connected = Boolean(telemetry?.meta.hand_connected?.[selectedHand.toLowerCase() as 'left' | 'right']);
  return <section className="live-data-workspace">
    <div className="section-heading"><div><span className="eyebrow">ENGINEERING VIEW</span><h2>Live glove data</h2><p>Raw sensor, articulation, and joint data remain available as a secondary workspace.</p></div><div className="hand-switch">{(['LEFT', 'RIGHT'] as const).map((side) => <button key={side} className={selectedHand === side ? 'selected' : ''} onClick={() => setSelectedHand(side)}>{side}</button>)}</div></div>
    <div className="dashboard-grid"><article className="panel orientation-panel"><div className="panel-heading"><div><Hand /><span><strong>LIVE 3D HAND</strong><small>Measured kinematic joint rotations</small></span></div><span className="live-tag">{connected ? 'LIVE' : 'WAITING'}</span></div><LiveHandRig side={selectedHand} joints={connected ? hand?.kinematic?.joints : undefined} /><CalibrationControls side={selectedHand} hand={hand} connected={connected} bridgeOnline={bridgeOnline} onCommand={sendCommand} pending={pendingCommand} message={commandStatus} /><div className="quaternion-row">{(['x', 'y', 'z', 'w'] as const).map((axis) => <Metric key={axis} label={`IMU ${axis.toUpperCase()}`} value={connected ? orientation?.[axis]?.toFixed(4) ?? '—' : '—'} />)}</div></article>
      <article className="panel"><div className="panel-heading"><div><SlidersHorizontal /><span><strong>FINGER FLEXION</strong><small>Normalized primary bend channels</small></span></div><span className="count-tag">{Object.keys(hand?.sliders ?? {}).length} CHANNELS</span></div><div className="slider-list">{sliderNames.map((name, index) => { const value = hand?.sliders?.[sliderKeys[index]]; return <div className="data-slider" key={name}><span>{name}</span><div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, (value ?? 0) * 100))}%` }} /></div><code>{value?.toFixed(3) ?? '—'}</code></div>; })}</div><div className="axis-values">{(['X', 'Y', 'Z'] as const).map((axis, index) => <Metric key={axis} label={`ACCEL ${axis}`} value={acceleration ? accelValues[index].toFixed(3) : '—'} accent={Boolean(acceleration && Math.abs(accelValues[index]) === accelMax)} />)}</div></article></div>
    <HandStateInspector hand={hand} side={selectedHand} />
  </section>;
}

export default function Home() {
  const [view, setView] = useState<'exercises' | 'live' | 'reports'>('exercises');
  const [selectedHand, setSelectedHand] = useState<'LEFT' | 'RIGHT'>('RIGHT');
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<'checking' | 'required' | 'valid'>('valid');
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseResult, setLicenseResult] = useState<LicenseResult | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState<'checking' | 'required' | 'valid'>('valid');
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [showPatientLogin, setShowPatientLogin] = useState(false);
  const [commandStatus, setCommandStatus] = useState('');
  const [pendingCommand, setPendingCommand] = useState<'calibration' | 'tare' | null>(null);
  const [pendingExercise, setPendingExercise] = useState<{ exercise: ActiveExercise; side: HandSide } | null>(null);
  const [xrGame, setXRGame] = useState<XRGameLaunchResult>({ status: 'idle', message: '' });
  const [showGloveModal, setShowGloveModal] = useState(false);
  const automaticXRLaunchAttempted = useRef(false);

  const validateLicense = useCallback(async (key: string, persist = true) => {
    setLicenseBusy(true);
    try {
      const response = await fetch(`${API}/api/license/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      const result = await response.json() as LicenseResult;
      setLicenseResult(result);
      if (result.valid) {
        if (persist) window.localStorage.setItem('wizio_license_key', key.trim().toUpperCase());
        setLicenseStatus('valid');
      } else {
        window.localStorage.removeItem('wizio_license_key');
        setLicenseStatus('required');
      }
    } catch {
      setLicenseResult({ valid: false, status: 'unavailable', message: 'The local glove bridge is unavailable. Start the application and try again.' });
      setLicenseStatus('required');
    } finally { setLicenseBusy(false); }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('wizio_license_key');
    if (!saved) { setLicenseStatus('required'); return; }
    setLicenseKey(saved);
    void validateLicense(saved, false);
  }, [validateLicense]);

  useEffect(() => {
    if (licenseStatus !== 'valid') return;
    fetch('/api/auth/session').then(async (response) => await response.json() as AuthState).then((session) => {
      setAuth(session);
      setAuthStatus(session.authenticated ? 'valid' : 'required');
    }).catch(() => setAuthStatus('required'));
  }, [licenseStatus]);

  useEffect(() => {
    if (licenseStatus !== 'valid') { setBridgeOnline(false); setTelemetry(null); return; }
    let socket: WebSocket | null = null;
    let retry: number | undefined;
    let disposed = false;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socket.onopen = () => setBridgeOnline(true);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setTelemetry(data);
          if (data?.meta?.xr_game_running === false) {
            setXRGame((prev) => (prev.status === 'started' || prev.status === 'already_running' ? { status: 'idle', message: 'XR Game was closed.' } : prev));
          } else if (data?.meta?.xr_game_running === true) {
            setXRGame((prev) => (prev.status === 'idle' || prev.status === 'stopping' ? { status: 'already_running', message: 'XR Game is already running in the background.' } : prev));
          }
        } catch { /* local malformed packet */ }
      };
      socket.onclose = () => { setBridgeOnline(false); if (!disposed) retry = window.setTimeout(connect, 1500); };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { disposed = true; if (retry) window.clearTimeout(retry); socket?.close(); };
  }, [licenseStatus]);

  useEffect(() => {
    if (licenseStatus === 'valid') {
      fetch(`${API}/api/xr-game/launch`, { method: 'POST' })
        .then(async (res) => await res.json() as XRGameLaunchResult)
        .then((result) => { if (result?.status) setXRGame(result); })
        .catch(() => {});
    }
  }, [licenseStatus]);

  const handHasData = useCallback((side: 'LEFT' | 'RIGHT') => Boolean(telemetry?.meta.hand_connected?.[side.toLowerCase() as 'left' | 'right']), [telemetry]);
  const anyGloveConnected = bridgeOnline && (handHasData('LEFT') || handHasData('RIGHT'));
  const calibrationFor = useCallback((side: HandSide) => {
    const hand = telemetry?.hands[side.toLowerCase() as 'left' | 'right'];
    const state = hand?.articulation_state ?? null;
    const liveSerial = String(hand?.orientation?.header?.serial ?? hand?.kinematic?.header?.serial ?? '');
    const calibrationSerial = String(state?.header?.serial ?? '');
    const current = Boolean(state && state.label.trim().toUpperCase() === 'BASIC' && (!liveSerial || calibrationSerial === liveSerial));
    return { state: current ? state : null, serial: liveSerial, current };
  }, [telemetry]);
  const pendingCalibration = pendingExercise ? calibrationFor(pendingExercise.side) : null;

  const launchXRGame = useCallback(async () => {
    setXRGame({ status: 'launching', message: 'Opening the installed XR Game…' });
    try {
      const response = await fetch(`${API}/api/xr-game/launch`, { method: 'POST' });
      if (!response.ok) throw new Error();
      setXRGame(await response.json() as XRGameLaunchResult);
    } catch {
      setXRGame({ status: 'error', message: 'The local bridge could not open XR Game.' });
    }
  }, []);

  useEffect(() => {
    if (showGloveModal) {
      void launchXRGame();
    }
  }, [showGloveModal, launchXRGame]);

  useEffect(() => {
    if (anyGloveConnected && showGloveModal) {
      setShowGloveModal(false);
    }
  }, [anyGloveConnected, showGloveModal]);

  const disconnectXRGame = useCallback(async () => {
    setXRGame({ status: 'stopping', message: 'Stopping the glove service…' });
    try {
      const response = await fetch(`${API}/api/xr-game/stop`, { method: 'POST' });
      const result = await response.json() as XRGameLaunchResult;
      setXRGame({ status: 'idle', message: 'Gloves disconnected' });
      setTelemetry(null);
      setPendingExercise(null);
    } catch {
      setXRGame({ status: 'error', message: 'The local bridge could not disconnect the gloves.' });
    }
  }, []);

  useEffect(() => {
    if (handHasData(selectedHand)) return;
    const other = selectedHand === 'LEFT' ? 'RIGHT' : 'LEFT';
    if (handHasData(other)) setSelectedHand(other);
  }, [handHasData, selectedHand]);

  const activateExercise = useCallback(async (exercise: ActiveExercise, side: HandSide) => {
    try {
      await fetch(`${API}/api/exercise`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise, hand: side.toLowerCase() }) });
      await fetch('/api/reports/session/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exercise, hand: side.toLowerCase() }) });
    }
    catch { setCommandStatus('Unable to activate detector'); window.setTimeout(() => setCommandStatus(''), 2500); }
  }, []);

  const finishExercise = useCallback(async (summary?: SessionSummary) => {
    try {
      const payload = summary ? {
        exercise: summary.exercise || 'hand_open_close',
        hand: (summary.side || selectedHand).toLowerCase(),
        reps: summary.reps ?? 0,
        score: summary.score ?? 0,
        duration_seconds: summary.duration_seconds ?? 0,
        counts: summary.counts ?? {},
        outcome: 'completed',
      } : {
        exercise: 'hand_open_close',
        hand: selectedHand.toLowerCase(),
        reps: 0,
        score: 0,
        duration_seconds: 0,
        counts: {},
        outcome: 'completed',
      };

      await fetch('/api/reports/session/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await fetch('/api/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exercise: 'none', hand: selectedHand.toLowerCase() })
      });
      setCommandStatus('Exercise report saved');
      setView('reports');
    } catch { setCommandStatus('Unable to save exercise report'); }
    window.setTimeout(() => setCommandStatus(''), 3000);
  }, [selectedHand]);

  const selectExercise = (exercise: ActiveExercise) => {
    const calibration = calibrationFor(selectedHand);
    if (handHasData(selectedHand) && calibration.state?.status !== 4) {
      setPendingExercise({ exercise, side: selectedHand });
      return;
    }
    void activateExercise(exercise, selectedHand);
  };

  const sendCommand = async (action: 'articulation_basic_calibrate' | 'imu_tare', kind: 'calibration' | 'tare', side: 'LEFT' | 'RIGHT' = selectedHand) => {
    setSelectedHand(side);
    setPendingCommand(kind);
    try {
      const response = await fetch(`${API}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, hand: side.toLowerCase() }) });
      if (!response.ok) throw new Error();
      setCommandStatus(kind === 'calibration' ? 'Calibration requested — follow the XR pose sequence' : 'Wrist tare sent at the current neutral pose');
    } catch { setCommandStatus('Command could not be sent'); }
    finally { setPendingCommand(null); window.setTimeout(() => setCommandStatus(''), 4500); }
  };

  useEffect(() => {
    if (!pendingExercise) return;
    if (!handHasData(pendingExercise.side)) {
      setPendingExercise(null);
      return;
    }
    if (calibrationFor(pendingExercise.side).state?.status === 4) {
      const requested = pendingExercise;
      setPendingExercise(null);
      setSelectedHand(requested.side);
      void activateExercise(requested.exercise, requested.side);
    }
  }, [activateExercise, calibrationFor, handHasData, pendingExercise]);

  const doctorLogin = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/auth/doctor-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      if (!response.ok) return 'Invalid doctor username or password.';
      setAuth(await response.json() as AuthState); setAuthStatus('valid'); setView('exercises'); return null;
    } catch { return 'Doctor login service is unavailable.'; }
  };

  const patientLogin = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/auth/patient-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      if (!response.ok) return 'Invalid patient username or password.';
      setAuth(await response.json() as AuthState); setShowPatientLogin(false); setView('exercises'); return null;
    } catch { return 'Patient Portal Sign In service is unavailable.'; }
  };

  const selectPatient = async (patientId: string) => {
    const response = await fetch('/api/auth/select-patient', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient_id: patientId }) });
    if (response.ok) {
      const data = await response.json() as AuthState;
      setAuth(data);
      setView('exercises');
      void launchXRGame();
      if (!anyGloveConnected) {
        setShowGloveModal(true);
      }
    }
  };

  const endPatient = async () => {
    await disconnectXRGame();
    const response = await fetch('/api/auth/end-patient', { method: 'POST' });
    if (response.ok) {
      setAuth(await response.json() as AuthState);
      setTelemetry(null);
      setPendingExercise(null);
      setShowGloveModal(false);
      setView('exercises');
    }
  };

  const logout = async () => {
    if (auth?.patient) await disconnectXRGame();
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuth(null); setAuthStatus('required'); setTelemetry(null); setShowGloveModal(false); setView('exercises');
  };

  const patientActive = Boolean(auth?.patient);
  return <main className="app-shell redesigned-app">
    <header className="therapy-topbar"><div className="brand"><div className="brand-mark"><img src="/app_icon.png" alt="206 AI" className="brand-app-icon" /></div><div><h1>206 AI</h1><p>CLINICAL NEURO-REHABILITATION WORKSTATION</p></div></div><nav aria-label="Application sections"><button className={view === 'exercises' ? 'selected' : ''} onClick={() => setView('exercises')}>Exercises</button><button disabled={!patientActive} className={view === 'live' ? 'selected' : ''} onClick={() => patientActive && setView('live')}>Live data</button><button className={view === 'reports' ? 'selected' : ''} onClick={() => setView('reports')}>Reports</button></nav><div className="topbar-actions"><div className="topbar-status"><span className={patientActive && anyGloveConnected ? 'connected' : ''}><i />{patientActive ? anyGloveConnected ? 'GLOVES LIVE' : 'PATIENT SESSION' : auth?.authenticated ? 'DOCTOR WORKSPACE' : 'AUTHENTICATION'}</span><small>{patientActive ? `${auth?.patient?.name} · ${auth?.patient?.id}` : auth?.doctor?.name ?? 'Doctor login required'}</small></div>{patientActive && (anyGloveConnected ? <Button type="button" variant="outline" className="disconnect-gloves" style={{ borderColor: '#fecaca', color: '#dc2626' }} onClick={() => void disconnectXRGame()}><Power className="mr-2" />Disconnect Gloves</Button> : <Button type="button" style={{ background: '#0F6C73', color: '#ffffff' }} onClick={() => { setShowGloveModal(true); void launchXRGame(); }}><Bluetooth className="mr-2" />Connect Gloves</Button>)}{patientActive && <Button type="button" variant="outline" className="disconnect-gloves" onClick={() => void endPatient()}><User />End patient</Button>}{auth?.authenticated && <Button type="button" variant="outline" className="logout-button" onClick={() => void logout()}><LogOut />Logout</Button>}</div></header>
    {patientActive && <section className="therapy-status"><div><Radio /><span><strong>{telemetry?.meta.packet_rate ?? 0} Hz</strong><small>PACKET RATE</small></span></div><div><Gauge /><span><strong>{selectedHand}</strong><small>ACTIVE HAND</small></span></div><div><Wifi /><span><strong>{handHasData('LEFT') ? 'CONNECTED' : 'OFFLINE'}</strong><small>LEFT GLOVE</small></span></div><div><Wifi /><span><strong>{handHasData('RIGHT') ? 'CONNECTED' : 'OFFLINE'}</strong><small>RIGHT GLOVE</small></span></div></section>}
    <div className="therapy-main">{patientActive
      ? view === 'exercises' ? <ExerciseWorkspace telemetry={telemetry} selectedHand={selectedHand} setSelectedHand={setSelectedHand} selectExercise={selectExercise} finishExercise={(summary) => void finishExercise(summary)} sendCommand={sendCommand} pendingCommand={pendingCommand} commandStatus={commandStatus} bridgeOnline={bridgeOnline} /> : view === 'live' ? <LiveDataWorkspace telemetry={telemetry} selectedHand={selectedHand} setSelectedHand={setSelectedHand} bridgeOnline={bridgeOnline} sendCommand={sendCommand} pendingCommand={pendingCommand} commandStatus={commandStatus} /> : <ReportsWorkspace activePatient={auth?.patient} />
      : view === 'reports' ? <ReportsWorkspace /> : <DoctorExerciseCatalog doctorId={auth?.doctor?.id} onSelectPatient={(id) => void selectPatient(id)} onPatientLogin={() => setShowPatientLogin(true)} />}</div>
    
    {licenseStatus === 'valid' && authStatus === 'required' && <LoginGate kind="doctor" onLogin={doctorLogin} />}
    {showPatientLogin && <LoginGate kind="patient" onLogin={patientLogin} onCancel={() => setShowPatientLogin(false)} />}
    {showGloveModal && <ConnectionGate bridgeOnline={bridgeOnline} xrGame={xrGame} anyGloveConnected={anyGloveConnected} onConnect={() => void launchXRGame()} onDisconnect={() => void disconnectXRGame()} onBack={() => { setShowGloveModal(false); if (patientActive) void endPatient(); }} />}
    {licenseStatus === 'valid' && authStatus === 'valid' && patientActive && pendingExercise && pendingCalibration?.state?.status !== 4 && <CalibrationGate requirements={[{ side: pendingExercise.side, state: pendingCalibration?.state ?? null, serial: pendingCalibration?.serial ?? '' }]} exercise={pendingExercise.exercise} pending={pendingCommand} message={commandStatus} onCalibrate={(side) => void sendCommand('articulation_basic_calibrate', 'calibration', side)} onTare={(side) => void sendCommand('imu_tare', 'tare', side)} onCancel={() => setPendingExercise(null)} />}
  </main>;
}
