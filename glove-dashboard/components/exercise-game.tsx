'use client';

import { Activity, CheckCircle2, Radio } from 'lucide-react';

type ExerciseMode = 'pronation_supination' | 'circumduction' | 'hand_open_close';
type ExerciseState = {
  activity: string;
  latest: { movement: string; timestamp_ms: number } | null;
  counts: Record<string, number>;
  pronation_supination: { state: string; angular_velocity: number; projected_rotation: number; direction_consistency: number; palm_dot_change: number };
  circumduction: { state: string; score: number; loop_strength: number; average_velocity: number; signed_area: number };
  hand_open_close: { state: string; raw_flexion: number; smoothed_flexion: number; confidence: number; open_threshold: number; close_threshold: number };
};

const CONFIG = {
  pronation_supination: {
    title: 'Pronation / Supination',
    movements: [['pronation', 'Pronation'], ['supination', 'Supination']] as const,
    instruction: 'Rotate the palm down, return through neutral, then rotate the palm up.',
  },
  circumduction: {
    title: 'Wrist Circumduction',
    movements: [['clockwise', 'Clockwise'], ['anticlockwise', 'Anticlockwise']] as const,
    instruction: 'Trace a smooth circle with the wrist while keeping the forearm steady.',
  },
  hand_open_close: {
    title: 'Wrist Open / Close',
    movements: [['wrist_open', 'Wrist Open'], ['wrist_close', 'Wrist Close']] as const,
    instruction: 'Extend all four fingers, then close into a comfortable fist.',
  },
};

export function ExerciseGame({ mode, exercise, live, side }: { mode: ExerciseMode; exercise?: ExerciseState; live: boolean; side: 'LEFT' | 'RIGHT' }) {
  const config = CONFIG[mode];
  const latest = exercise?.latest?.movement;
  const repetitionCount = mode === 'pronation_supination'
    ? Math.min(exercise?.counts.pronation ?? 0, exercise?.counts.supination ?? 0)
    : mode === 'hand_open_close'
      ? exercise?.counts.wrist_close ?? 0
      : (exercise?.counts.clockwise ?? 0) + (exercise?.counts.anticlockwise ?? 0);

  return <article className="tracking-card">
    <header className="tracking-heading">
      <div className={`tracking-live ${live ? 'active' : ''}`}><Radio /><span>{live ? 'TRACKING ACTIVE' : 'WAITING FOR GLOVE'}</span></div>
      <div><span>SELECTED EXERCISE</span><strong>{config.title}</strong><small>{side} glove · detector runs automatically</small></div>
      <div className="total-repetitions"><span>COMPLETED REPS</span><strong>{repetitionCount}</strong></div>
    </header>
    <p className="tracking-instruction">{config.instruction}</p>
    <div className="repetition-grid">
      {config.movements.map(([movement, label]) => <div key={movement} className={latest === movement ? 'detected' : ''}>
        <span>{label}</span>
        <strong>{exercise?.counts[movement] ?? 0}</strong>
        <small>{latest === movement ? <><CheckCircle2 /> LAST DETECTED</> : 'STATE COUNT'}</small>
      </div>)}
    </div>
    <div className="tracker-state"><Activity /><span>CURRENT STATE</span><strong>{exercise?.activity?.replaceAll('_', ' ').toUpperCase() ?? 'IDLE'}</strong></div>
  </article>;
}
