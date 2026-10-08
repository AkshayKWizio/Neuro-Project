# Deferred bugs

## Glove handedness reverses pronation/supination game controls

- **Status:** Resolved.
- **Observed with:** Left glove.
- **Fix applied:** Applied a handedness-aware direction transform in `exercise-session.tsx` and the compiled web chunk. For the Left glove during pronation/supination, `move_left` and `move_right` are inverted so pronation and supination map consistently for both left- and right-hand use. Raw exercise detection and telemetry remain unchanged.
