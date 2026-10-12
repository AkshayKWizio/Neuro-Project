// A movement name describes the destination pose of the detected transition.
// LH: supination -> pronation = right; pronation -> supination = left.
// RH: the reverse. This is game mapping only, not a clinical detector.
export function rotationAction(side: 'LEFT' | 'RIGHT', movement: string) {
  if (movement !== 'pronation' && movement !== 'supination') return null;
  const left = side === 'LEFT' ? movement === 'supination' : movement === 'pronation';
  return left
    ? { action: 'move_left' as const, key: 'ArrowLeft', label: 'MOVE LEFT' }
    : { action: 'move_right' as const, key: 'ArrowRight', label: 'MOVE RIGHT' };
}
