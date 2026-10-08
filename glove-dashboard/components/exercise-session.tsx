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
    clockwise: { action: 'primary_action', key: 'ArrowUp', label: 'PRIMARY ACTION' },
    anticlockwise: { action: 'secondary_action', key: 'ArrowDown', label: 'SECONDARY ACTION' },
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
    // Account for active glove side so pronation and supination map consistently
    if (side === 'LEFT' && mode === 'pronation_supination') {
      if (action === 'move_left') {
        action = 'move_right';
        key = 'ArrowRight';
      } else if (action === 'move_right') {
        action = 'move_left';
        key = 'ArrowLeft';
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

export type RehabGameId = 'gelato_tower' | 'balloon_blitz' | 'pizza_spin' | 'rolling_wonder' | 'fruit_picker' | 'balloon_pop';

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
    id: 'gelato_tower',
    title: 'Gelato Tower',
    subtitle: '3D Wobbly Scoops & Balance',
    badge: 'ROTATION',
    icon: 'rotate',
    url: '/games/gelato-tower/index.html',
    clinicalTarget: 'Pronation / Supination'
  },
  {
    id: 'balloon_blitz',
    title: 'Balloon Blitz',
    subtitle: '3D Inflate & Fly Festival',
    badge: 'GRASP / EXTEND',
    icon: 'target',
    url: '/games/balloon-blitz/index.html',
    clinicalTarget: 'Hand Open / Close'
  },
  {
    id: 'pizza_spin',
    title: 'Pizza Spin',
    subtitle: '3D Italian Kitchen & Dough Whirl',
    badge: '360° CIRCLE',
    icon: 'rotate',
    url: '/games/pizza-spin/index.html',
    clinicalTarget: 'Wrist Circumduction'
  },
  {
    id: 'rolling_wonder',
    title: 'Rolling Wonder',
    subtitle: '3D Rainbow Hamster Runner',
    badge: 'FULL MOBILITY',
    icon: 'gauge',
    url: '/games/rolling-wonder/index.html',
    clinicalTarget: 'Multi-Movement Agility'
  }
];

export function ExerciseSession({ mode, side, latest, guidance, tracker, details, onFinish, onTare, tarePending, tareDisabled, tareStatus, hand }: {
  mode: ExerciseMode;
  side: 'LEFT' | 'RIGHT';
  latest: ExerciseEvent | null | undefined;
  guidance: ReactNode;
  tracker: ReactNode;
  details: ReactNode;
  onFinish: () => void;
  onTare: () => void;
  tarePending: boolean;
  tareDisabled: boolean;
  tareStatus: string;
  hand?: any;
}) {
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [showHandHud, setShowHandHud] = useState(true);
  const [handHudMinimized, setHandHudMinimized] = useState(false);
  const [handHudMode, setHandHudMode] = useState<'live' | 'guide'>('live');

  // Default game based on clinical exercise
  const initialGame: RehabGameId = useMemo(() => {
    if (mode === 'pronation_supination') return 'gelato_tower';
    if (mode === 'hand_open_close') return 'balloon_blitz';
    if (mode === 'circumduction') return 'pizza_spin';
    return 'gelato_tower';
  }, [mode]);

  const [selectedGame, setSelectedGame] = useState<RehabGameId>(initialGame);
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
      if ((event.data as { type?: unknown } | null)?.type === 'night-relay-ready') setGameReady(true);
    };
    window.addEventListener('message', onGameMessage);
    return () => window.removeEventListener('message', onGameMessage);
  }, []);

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
        <Button type="button" className="cinema-finish-btn" onClick={onFinish}>
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

        {showHandHud && (
          <div className={`floating-hand-hud ${handHudMinimized ? 'minimized' : ''}`}>
            <div className="hand-hud-header">
              <div className="hand-hud-title">
                <span className="live-dot" />
                <strong>3D BIOMETRIC TWIN</strong>
                <span className="hand-badge">{side} GLOVE</span>
              </div>
              <div className="hand-hud-actions">
                <button
                  type="button"
                  className="hud-mode-toggle"
                  onClick={() => setHandHudMode((m) => (m === 'live' ? 'guide' : 'live'))}
                  title="Switch Live Telemetry vs Guide Pose"
                >
                  {handHudMode === 'live' ? 'Live Telemetry' : 'Guide Pose'}
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
                  title="Close HUD"
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
                    <span>FOREARM ROLL</span>
                    <strong>
                      {typeof hand?.orientation?.orientation?.x === 'number'
                        ? (hand.orientation.orientation.x * 100).toFixed(1) + '°'
                        : '0.0°'}
                    </strong>
                  </div>
                  <div className="hud-metric">
                    <span>FINGER BEND</span>
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
                    style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', height: '28px', padding: '0 8px', color: '#38bdf8', borderColor: '#0F6C73' }}
                  >
                    <Rotate3D style={{ width: '13px', height: '13px' }} />
                    {tarePending ? 'Taring…' : 'Tare Wrist'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="hand-hud-mini" onClick={() => setHandHudMinimized(false)}>
                <span>{side} BIOMETRIC TWIN · ACTIVE</span>
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
