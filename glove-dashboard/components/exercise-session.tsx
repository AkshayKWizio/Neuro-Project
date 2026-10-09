'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Camera, CameraOff, Check, ChevronDown, ChevronUp, Gamepad2, Hand, RefreshCw, Rotate3D, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveHandRig } from '@/components/live-hand-rig';

type ExerciseMode = 'pronation_supination' | 'circumduction' | 'hand_open_close';
type ExerciseEvent = { movement: string; timestamp_ms: number };

export type GameAction = 'move_left' | 'move_right' | 'primary_action' | 'secondary_action';

export type GameActionDetail = {
  action: GameAction;
  exercise: ExerciseMode;
  movement: string;
  side: 'LEFT' | 'RIGHT';
  timestamp_ms: number;
  keyboard_key: string;
};

const ACTIONS: Record<ExerciseMode, Record<string, { action: GameAction; key: string; label: string }>> = {
  pronation_supination: {
    pronation: { action: 'move_left', key: 'ArrowLeft', label: 'MOVE LEFT' },
    supination: { action: 'move_right', key: 'ArrowRight', label: 'MOVE RIGHT' },
  },
  circumduction: {
    clockwise: { action: 'move_right', key: 'ArrowRight', label: 'TURN RIGHT' },
    anticlockwise: { action: 'move_left', key: 'ArrowLeft', label: 'TURN LEFT' },
  },
  hand_open_close: {
    wrist_close: { action: 'primary_action', key: 'Space', label: 'PRIMARY ACTION' },
    wrist_open: { action: 'secondary_action', key: 'ArrowUp', label: 'SECONDARY ACTION' },
  },
};

const EXERCISE_TITLES: Record<ExerciseMode, string> = {
  pronation_supination: 'Pronation / Supination',
  circumduction: 'Wrist Circumduction',
  hand_open_close: 'Hand Open / Close',
};

export const GAME_ACTION_EVENT = 'neuro:game-action';

function ExerciseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'requesting' | 'live' | 'denied' | 'unavailable' | 'error'>('requesting');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let disposed = false;
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      const unavailableTimer = window.setTimeout(() => setStatus('unavailable'), 0);
      return () => { window.clearTimeout(unavailableTimer); stopCamera(); };
    }

    void navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    }).then(async (stream) => {
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setStatus('live');
    }).catch((error: DOMException) => {
      if (disposed) return;
      setStatus(error?.name === 'NotAllowedError' ? 'denied' : 'error');
    });

    return () => {
      disposed = true;
      stopCamera();
    };
  }, [attempt, stopCamera]);

  return <section className="session-camera" aria-label="Live exercise camera">
    <header><span><Camera /> LIVE CAMERA</span><small className={status === 'live' ? 'camera-live' : ''}><i />{status === 'live' ? 'LIVE' : status === 'requesting' ? 'STARTING' : 'OFF'}</small></header>
    <div className="camera-viewport">
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live local camera feedback" />
      {status !== 'live' && <div className="camera-message">
        <CameraOff />
        <strong>{status === 'requesting' ? 'Starting camera…' : status === 'denied' ? 'Camera permission is blocked' : status === 'unavailable' ? 'Camera is unavailable' : 'Camera could not start'}</strong>
        <span>{status === 'denied' ? 'Allow camera access in Chrome, then retry.' : status !== 'requesting' ? 'Check that another application is not using the camera.' : 'Chrome may ask you to allow access.'}</span>
        {status !== 'requesting' && <Button type="button" variant="outline" onClick={() => { setStatus('requesting'); setAttempt((value) => value + 1); }}><RefreshCw />Retry camera</Button>}
      </div>}
    </div>
    <footer><ShieldCheck /> Local preview only · not recorded or uploaded</footer>
  </section>;
}

function useGameActionBridge(mode: ExerciseMode, side: 'LEFT' | 'RIGHT', latest: ExerciseEvent | null | undefined) {
  const sessionKey = `${side}:${mode}`;
  const sessionRef = useRef(sessionKey);
  const timestampRef = useRef(latest?.timestamp_ms ?? 0);
  const currentAction = useMemo<GameActionDetail | null>(() => {
    const mapping = latest ? ACTIONS[mode][latest.movement] : null;
    if (!latest || !mapping) return null;
    let action = mapping.action;
    let key = mapping.key;
    // Account for active glove side so pronation and supination map consistently:
    // LH Hand: Pronation to Supination -> Turn Left; Supination to Pronation -> Turn Right
    // RH Hand: Opposite (Pronation to Supination -> Turn Right; Supination to Pronation -> Turn Left)
    if (mode === 'pronation_supination') {
      if (side === 'LEFT') {
        if (latest.movement === 'supination') {
          action = 'move_left';
          key = 'ArrowLeft';
        } else if (latest.movement === 'pronation') {
          action = 'move_right';
          key = 'ArrowRight';
        }
      } else {
        if (latest.movement === 'supination') {
          action = 'move_right';
          key = 'ArrowRight';
        } else if (latest.movement === 'pronation') {
          action = 'move_left';
          key = 'ArrowLeft';
        }
      }
    }
    return {
      action,
      exercise: mode,
      movement: latest.movement,
      side,
      timestamp_ms: latest.timestamp_ms,
      keyboard_key: key,
    };
  }, [latest, mode, side]);

  useEffect(() => {
    const timestamp = latest?.timestamp_ms ?? 0;
    if (sessionRef.current !== sessionKey) {
      sessionRef.current = sessionKey;
      timestampRef.current = timestamp;
      return;
    }
    if (!latest || timestamp <= timestampRef.current) return;
    timestampRef.current = timestamp;
    if (!currentAction) return;
    window.dispatchEvent(new CustomEvent<GameActionDetail>(GAME_ACTION_EVENT, { detail: currentAction }));
  }, [currentAction, latest, sessionKey]);

  return currentAction;
}

export type RehabGameId = 'balloon_blitz' | 'sky_glider' | 'rolling_wonder';

export interface RehabGame {
  id: RehabGameId;
  title: string;
  subtitle: string;
  badge: string;
  icon: string;
  url: string;
  clinicalTarget: string;
}

export const REHAB_GAMES: RehabGame[] = [
  {
    id: 'balloon_blitz',
    title: 'Balloon Blitz',
    subtitle: '3D Inflate & Fly Festival',
    badge: 'WRIST OPEN / CLOSE',
    icon: 'target',
    url: '/games/balloon-blitz/index.html',
    clinicalTarget: 'Wrist Open / Close'
  },
  {
    id: 'sky_glider',
    title: 'Sky Glider',
    subtitle: '3D Canyon Flight & Ring Navigation',
    badge: 'PRONATION / SUPINATION',
    icon: 'rotate',
    url: '/games/sky-glider/index.html',
    clinicalTarget: 'Pronation / Supination'
  },
  {
    id: 'rolling_wonder',
    title: 'Rolling Wonder',
    subtitle: '3D Rainbow Hamster Runner',
    badge: 'WRIST CIRCUMDUCTION',
    icon: 'gauge',
    url: '/games/rolling-wonder/index.html',
    clinicalTarget: 'Wrist Circumduction'
  }
];

export interface SessionSummary {
  exercise: ExerciseMode;
  side: 'LEFT' | 'RIGHT';
  reps: number;
  score: number;
  duration_seconds: number;
  counts: Record<string, number>;
}

export function ExerciseSession({ mode, side, latest, guidance, tracker, details, onFinish, onTare, tarePending, tareDisabled, tareStatus, hand }: {
  mode: ExerciseMode;
  side: 'LEFT' | 'RIGHT';
  latest: ExerciseEvent | null | undefined;
  guidance: ReactNode;
  tracker: ReactNode;
  details: ReactNode;
  onFinish: (summary?: SessionSummary) => void;
  onTare: () => void;
  tarePending: boolean;
  tareDisabled: boolean;
  tareStatus: string;
  hand?: any;
}) {
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [countDown, setCountDown] = useState(3);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [showHandHud, setShowHandHud] = useState(true);
  const [handHudMinimized, setHandHudMinimized] = useState(false);
  const [handHudMode, setHandHudMode] = useState<'live' | 'guide'>('live');
  const [sessionReps, setSessionReps] = useState(0);
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  // Default game based on clinical exercise
  const initialGame: RehabGameId = useMemo(() => {
    if (mode === 'pronation_supination') return 'sky_glider';
    if (mode === 'hand_open_close') return 'balloon_blitz';
    if (mode === 'circumduction') return 'rolling_wonder';
    return 'balloon_blitz';
  }, [mode]);

  const [selectedGame, setSelectedGame] = useState<RehabGameId>(initialGame);
  useEffect(() => {
    setSelectedGame(initialGame);
    setGameReady(false);
    setSessionReps(0);
    setSessionScore(0);
    setSessionCounts({});
    setSecondsElapsed(0);
  }, [initialGame]);
  const currentGame = useMemo(() => REHAB_GAMES.find(g => g.id === selectedGame) || REHAB_GAMES[0], [selectedGame]);

  const gameFrameRef = useRef<HTMLIFrameElement>(null);
  const bridgedAction = useGameActionBridge(mode, side, latest);
  const lastAction = bridgedAction?.exercise === mode && bridgedAction.side === side ? bridgedAction : null;
  const mapping = lastAction ? ACTIONS[mode][lastAction.movement] : null;
  const actionLabel = lastAction?.action === 'move_left' ? 'MOVE LEFT' : lastAction?.action === 'move_right' ? 'MOVE RIGHT' : mapping?.label;
  const postedTimestampRef = useRef(bridgedAction?.timestamp_ms ?? 0);

  useEffect(() => {
    const timer = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setCountDown(3);
    const cTimer = setInterval(() => {
      setCountDown((c) => {
        if (c <= 1) {
          clearInterval(cTimer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(cTimer);
  }, [selectedGame]);

  const formatDuration = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    const onGameMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== gameFrameRef.current?.contentWindow) return;
      const data = event.data as any;
      if (!data) return;
      if (data.type === 'night-relay-ready') setGameReady(true);
      if (data.type === 'NEURO_REP_EVENT') {
        const r = typeof data.reps === 'number' ? data.reps : 0;
        const s = typeof data.score === 'number' ? data.score : 0;
        const m = typeof data.movement === 'string' ? data.movement : mode;
        setSessionReps((prev) => Math.max(prev, r));
        setSessionScore((prev) => Math.max(prev, s));
        setSessionCounts((prev) => ({
          ...prev,
          [m]: (prev[m] || 0) + 1,
        }));
      } else if (data.type === 'exercise_rep') {
        const c = typeof data.count === 'number' ? data.count : 0;
        const m = typeof data.movement === 'string' ? data.movement : mode;
        setSessionReps((prev) => Math.max(prev, c));
        setSessionCounts((prev) => ({
          ...prev,
          [m]: (prev[m] || 0) + 1,
        }));
      }
    };
    window.addEventListener('message', onGameMessage);
    return () => window.removeEventListener('message', onGameMessage);
  }, [mode]);

  useEffect(() => {
    if (!latest?.movement) return;
    setSessionCounts((prev) => ({
      ...prev,
      [latest.movement]: (prev[latest.movement] || 0) + 1,
    }));
    setSessionReps((prev) => prev + 1);
  }, [latest]);

  useEffect(() => {
    if (!bridgedAction || bridgedAction.timestamp_ms <= postedTimestampRef.current) return;
    postedTimestampRef.current = bridgedAction.timestamp_ms;
    gameFrameRef.current?.contentWindow?.postMessage(
      { type: 'neuro-game-action', action: bridgedAction.action, movement: bridgedAction.movement, side: bridgedAction.side },
      window.location.origin,
    );
  }, [bridgedAction]);

  const [showClinicDrawer, setShowClinicDrawer] = useState(false);

  return <dialog open className="exercise-session exercise-session-overlay cinema-stage-overlay" aria-label={`${EXERCISE_TITLES[mode]} active exercise session`}>
    <header className="unified-cinema-header">
      <div className="cinema-header-left">
        <Hand />
        <div>
          <strong>206 AI</strong>
          <span className="cinema-exercise-badge">{EXERCISE_TITLES[mode]} · {side} HAND</span>
        </div>
      </div>

      <div className="cinema-game-tabs">
        {REHAB_GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            className={`cinema-tab-btn ${selectedGame === game.id ? 'active' : ''}`}
            onClick={() => {
              setSelectedGame(game.id);
              setGameReady(false);
            }}
            title={game.subtitle}
          >
            <span className="tab-title-text">{game.title}</span>
            <small className="tab-clinical-text">{game.clinicalTarget}</small>
          </button>
        ))}
      </div>

      <div className="cinema-header-right">
        <span className="cinema-timer">
          <span className="pulse-dot" />
          {formatDuration(secondsElapsed)}
        </span>
        <span className="cinema-rep-counter" title="Completed Clinical Repetitions">
          <strong>{sessionReps}</strong> REPS
        </span>
        {sessionScore > 0 && (
          <span className="cinema-score-counter" title="Game Score">
            ★ {sessionScore}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          className={`cinema-hand-btn ${showHandHud ? 'active' : ''}`}
          onClick={() => setShowHandHud((v) => !v)}
          title="Toggle Real-Time 3D Glove Biometric HUD"
        >
          <Hand />
          {showHandHud ? '3D Hand Active' : '3D Biometric Hand'}
        </Button>
        <Button type="button" variant="outline" className="cinema-tare-btn" disabled={tareDisabled || tarePending} onClick={onTare}>
          <Rotate3D />{tarePending ? 'Taring…' : 'Tare wrist'}
        </Button>
        <Button type="button" variant="outline" className={`cinema-clinic-btn ${showClinicDrawer ? 'active' : ''}`} onClick={() => setShowClinicDrawer((v) => !v)}>
          {showClinicDrawer ? 'Close Oversight' : 'Clinical Oversight'}
        </Button>
        <Button
          type="button"
          className="cinema-finish-btn"
          onClick={() => {
            const summary: SessionSummary = {
              exercise: mode,
              side,
              reps: sessionReps,
              score: sessionScore,
              duration_seconds: secondsElapsed,
              counts: Object.keys(sessionCounts).length > 0 ? sessionCounts : { [mode]: Math.max(1, sessionReps) },
            };
            onFinish(summary);
          }}
        >
          <Check />Finish session
        </Button>
      </div>
    </header>

    <div className="cinema-body">
      <div className="cinema-stage-container">
        <iframe
          ref={gameFrameRef}
          key={selectedGame}
          src={currentGame.url}
          className="cinema-iframe"
          title={`${currentGame.title} glove-controlled rehabilitation game`}
          allow="autoplay; fullscreen"
          onLoad={() => setGameReady(true)}
        />

        {(!gameReady || countDown > 0) && (
          <div className={`cinema-countdown-overlay theme-${selectedGame}`}>
            <div className="startup-bg-particles">
              <div className="particle-balloon" style={{ width: 48, height: 60, top: '12%', left: '8%', background: selectedGame === 'sky_glider' ? '#0284C7' : selectedGame === 'rolling_wonder' ? '#8B5CF6' : '#F43F5E' }} />
              <div className="particle-balloon" style={{ width: 34, height: 44, top: '65%', left: '6%', background: selectedGame === 'sky_glider' ? '#38BDF8' : selectedGame === 'rolling_wonder' ? '#EC4899' : '#0EA5E9', animationDelay: '1.2s' }} />
              <div className="particle-balloon" style={{ width: 52, height: 66, top: '18%', right: '10%', background: selectedGame === 'sky_glider' ? '#10B981' : selectedGame === 'rolling_wonder' ? '#F59E0B' : '#F59E0B', animationDelay: '2.4s' }} />
              <div className="particle-balloon" style={{ width: 38, height: 48, top: '70%', right: '14%', background: selectedGame === 'sky_glider' ? '#0D9488' : selectedGame === 'rolling_wonder' ? '#7C3AED' : '#10B981', animationDelay: '0.7s' }} />
            </div>

            <div className="startup-card">
              <div className="startup-badge-icon">
                {selectedGame === 'sky_glider' ? '✈️' : selectedGame === 'rolling_wonder' ? '🐹' : '🎈'}
              </div>
              <h2 className="startup-game-title">{currentGame.title}</h2>
              <p className="startup-game-sub">
                {selectedGame === 'sky_glider'
                  ? '3D Canyon Flight & Ring Navigation · Rotational Biofeedback'
                  : selectedGame === 'rolling_wonder'
                    ? '3D Rainbow Meadow Runner · 360° Circumduction Biofeedback'
                    : '3D Inflate & Fly Festival · Hand Grasp & Extension Biofeedback'}
              </p>
              <div className="startup-target-chip">
                <span className="chip-dot" />
                <span>
                  {selectedGame === 'sky_glider'
                    ? 'Target Protocol: Forearm Pronation / Supination'
                    : selectedGame === 'rolling_wonder'
                      ? 'Target Protocol: Wrist Circumduction (360°)'
                      : 'Target Protocol: Wrist Open / Close (Grasp & Extension)'}
                </span>
              </div>

              <div className="startup-steps-grid">
                {selectedGame === 'sky_glider' ? (
                  <>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#E0F2FE', color: '#0284C7' }}>PRONATION</span>
                      <span className="startup-step-action">Palm Down (Turn Left)</span>
                    </div>
                    <span className="startup-arrow">⇄</span>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#DCFCE7', color: '#16A34A' }}>SUPINATION</span>
                      <span className="startup-step-action">Palm Up (Turn Right)</span>
                    </div>
                    <span className="startup-arrow">➔</span>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#FEF3C7', color: '#D97706' }}>1 CLINICAL REP</span>
                      <span className="startup-step-action">Navigate Ring Cycle</span>
                    </div>
                  </>
                ) : selectedGame === 'rolling_wonder' ? (
                  <>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#EDE9FE', color: '#7C3AED' }}>CLOCKWISE</span>
                      <span className="startup-step-action">Turn Sphere Right</span>
                    </div>
                    <span className="startup-arrow">⇄</span>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#DCFCE7', color: '#16A34A' }}>ANTICLOCKWISE</span>
                      <span className="startup-step-action">Turn Sphere Left</span>
                    </div>
                    <span className="startup-arrow">➔</span>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#FEF3C7', color: '#D97706' }}>1 CLINICAL REP</span>
                      <span className="startup-step-action">Completed 360° Cycle</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#FEE2E2', color: '#DC2626' }}>WRIST CLOSE</span>
                      <span className="startup-step-action">Fist Grasp (Pump Air)</span>
                    </div>
                    <span className="startup-arrow">➔</span>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#DCFCE7', color: '#16A34A' }}>WRIST OPEN</span>
                      <span className="startup-step-action">Extend Hand (Launch)</span>
                    </div>
                    <span className="startup-arrow">➔</span>
                    <div className="startup-step-card">
                      <span className="startup-step-badge" style={{ background: '#FEF3C7', color: '#D97706' }}>1 CLINICAL REP</span>
                      <span className="startup-step-action">Launch Into Sky</span>
                    </div>
                  </>
                )}
              </div>

              <div className="startup-action-section">
                {!gameReady ? (
                  <>
                    <div className="startup-loading-text">
                      <span className="pulse-dot" style={{ background: '#0F6C73', width: 7, height: 7, borderRadius: '50%', display: 'inline-block' }} />
                      Calibrating 3D Engine &amp; Aligning Glove Telemetry…
                    </div>
                    <div className="startup-loading-bar-wrap">
                      <div className="startup-loading-bar-fill" />
                    </div>
                  </>
                ) : (
                  <div className="cinema-countdown-box">
                    <div className="cinema-countdown-num">{countDown}</div>
                    <div className="cinema-countdown-sub">
                      {countDown === 1
                        ? 'READY TO LAUNCH · BEGIN EXERCISE'
                        : countDown === 2
                          ? 'CALIBRATING ZERO DEGREES · STEADY'
                          : 'PREPARE NEUTRAL POSTURE'}
                    </div>
                    <button
                      type="button"
                      className="startup-skip-btn"
                      onClick={() => setCountDown(0)}
                    >
                      Start Immediately →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showHandHud && (
          <div className={`floating-hand-hud ${handHudMinimized ? 'minimized' : ''}`}>
            <div className="hand-hud-header">
              <div className="hand-hud-title">
                <span className="live-dot" />
                <strong>{side === 'LEFT' ? 'Left Hand' : 'Right Hand'}</strong>
              </div>
              <div className="hand-hud-actions">
                <button
                  type="button"
                  className="hud-mode-toggle"
                  onClick={() => setHandHudMode((m) => (m === 'live' ? 'guide' : 'live'))}
                  title="Switch Live vs Guide Pose"
                >
                  {handHudMode === 'live' ? 'Live' : 'Guide'}
                </button>
                <button
                  type="button"
                  className="hud-min-btn"
                  onClick={() => setHandHudMinimized((v) => !v)}
                  title={handHudMinimized ? 'Expand' : 'Minimize'}
                >
                  {handHudMinimized ? '▢' : '—'}
                </button>
                <button
                  type="button"
                  className="hud-close-btn"
                  onClick={() => setShowHandHud(false)}
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            {!handHudMinimized ? (
              <>
                <div className="hand-hud-viewport">
                  <LiveHandRig
                    side={side}
                    joints={handHudMode === 'live' ? hand?.kinematic?.joints : undefined}
                    guidanceMode={handHudMode === 'guide' ? mode : undefined}
                  />
                </div>
                <div className="hand-hud-footer">
                  <div className="hud-metric">
                    <span>ROLL</span>
                    <strong>
                      {typeof hand?.orientation?.orientation?.x === 'number'
                        ? (hand.orientation.orientation.x * 100).toFixed(1) + '°'
                        : '0.0°'}
                    </strong>
                  </div>
                  <div className="hud-metric">
                    <span>FLEXION</span>
                    <strong>
                      {typeof hand?.sliders?.index_mcp === 'number'
                        ? (hand.sliders.index_mcp * 100).toFixed(0) + '%'
                        : 'Active'}
                    </strong>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="hud-tare-btn"
                    disabled={tareDisabled || tarePending}
                    onClick={onTare}
                    title="Tare wrist neutral angle"
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '11px',
                      fontWeight: 600,
                      height: '28px',
                      padding: '0 10px',
                      background: '#0F6C73',
                      color: '#FFFFFF',
                      border: '1px solid #0D5C62',
                      borderRadius: '6px',
                      boxShadow: '0 1px 3px rgba(15, 108, 115, 0.25)',
                      cursor: (tareDisabled || tarePending) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Rotate3D style={{ width: '13px', height: '13px', color: '#FFFFFF', stroke: '#FFFFFF' }} />
                    {tarePending ? 'Taring…' : 'Tare Wrist'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="hand-hud-mini" onClick={() => setHandHudMinimized(false)}>
                <span>{side === 'LEFT' ? 'Left' : 'Right'} Hand · Active</span>
              </div>
            )}
          </div>
        )}

        {tareStatus.toLowerCase().includes('tare') && <div className="game-tare-status" aria-live="polite">{tareStatus}</div>}
      </div>

      {showClinicDrawer && <aside className="cinema-clinic-drawer">
        <div className="drawer-header">
          <strong>CLINICAL OVERSIGHT &amp; GUIDANCE</strong>
          <button type="button" className="drawer-close-btn" onClick={() => setShowClinicDrawer(false)}>✕</button>
        </div>
        <div className="drawer-scrollable">
          <div className="drawer-section">{guidance}</div>
          
          <div className="drawer-section">{tracker}</div>
          <div className="drawer-section">{details}</div>
        </div>
      </aside>}
    </div>
  </dialog>;
}
