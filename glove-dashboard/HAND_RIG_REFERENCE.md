# Neuro Web Hand Rig Reference

Last verified: 2 September 2026

This document records the current, SDK-verified hand-rig implementation. Treat it as the source of truth before changing the hand model, finger spacing, joint transforms, materials, or camera presentation.

## Verified baseline fingerprints

These SHA-256 values identify the exact files used for this verification. A
different hash does not automatically mean the code is wrong, but it means this
reference must be reviewed against the change rather than assumed current.

| File | SHA-256 at verification |
| --- | --- |
| `components/live-hand-rig.tsx` | `F6754801FFDD601DC4B88EB8D637EAF3FBAC58DA5829AF473A6827E9D5F5B45C` |
| `JointVisualiserBase.cs` | `3E4C14E6CF14F8EC7A463BA94F02E24E2F6CF9831F12E0F70C597CBC22AC6F7F` |
| `StretchSenseOSCReceiver.cs` | `A25844923B6962D7F3EF4809C3D91CF4821979C983F466184FC1A6726229276F` |

When an intentional hand-rig change is validated, update the implementation
description, validation evidence, date, and applicable fingerprints together.

## Current implementation

- Web component: `components/live-hand-rig.tsx`
- Local bridge: `backend/server.py`
- Renderer: Three.js with `FBXLoader`
- Left model: `LeftHandAnims.FBX`
- Right model: `RightHandAnims.FBX`
- Glove textures: `RealityL.png` and `RealityR.png`
- Live source: Python Reality SDK kinematic OSC packet
- Required joint count: 26 per hand

The bridge exposes the SDK assets locally:

- `GET /api/models/left-hand.fbx`
- `GET /api/models/right-hand.fbx`
- `GET /api/models/left-glove.png`
- `GET /api/models/right-glove.png`

The source assets are under:

`StretchSense SDK 0.7.0 (UPM)/com.stretchsense.sdk/Runtime/Prefabs/Hands/StretchSense/`

## Verified SDK behaviour

The Unity SDK renderer is implemented in:

`Runtime/Scripts/Hands/Articulation/JointVisualiserBase.cs`

For every frame and every mapped joint, it calls:

```csharp
tr.SetLocalPositionAndRotation(joint.position, joint.rotation);
```

The streamed transform is therefore an **absolute local transform**. It is not a rotation delta and must not be multiplied by the FBX bind/rest rotation.

The Python bridge preserves the raw OSC kinematic values. The Unity receiver converts those raw values into Unity coordinates by applying:

```text
position:   (-x,  y,  z)
quaternion: (-x,  y,  z, -w)
```

Three.js `FBXLoader` retains the FBX source coordinate convention. That convention matches the raw Python/OSC packet. Consequently, the web renderer must use the raw quaternion directly and must **not** repeat Unity's sign conversion.

The FBX skeleton uses centimetre-like units while OSC positions are in metres. The required web position conversion is:

```text
threePosition = oscPosition × 100
threeQuaternion = normalized raw OSC quaternion
```

Current live update logic:

```ts
const incoming = new THREE.Quaternion(
  joint.orientation.x,
  joint.orientation.y,
  joint.orientation.z,
  joint.orientation.w,
).normalize();

bone.position.set(
  joint.position.x * 100,
  joint.position.y * 100,
  joint.position.z * 100,
);
bone.quaternion.copy(incoming);
```

All 26 positions and rotations are applied, including palm and hand/wrist.

## Joint-to-bone map

| Packet index | Web joint name | Unity SDK name | FBX bone |
| ---: | --- | --- | --- |
| 0 | `palm` | `palm` | `WaveBone_0` |
| 1 | `hand` | `wrist` | `WaveBone_1` |
| 2 | `thumb_cmc` | `thumb_cmc` | `WaveBone_2` |
| 3 | `thumb_mcp` | `thumb_mcp` | `WaveBone_3` |
| 4 | `thumb_dip` | `thumb_ip` | `WaveBone_4` |
| 5 | `thumb_tip` | `thumb_tip` | `WaveBone_5` |
| 6 | `index_cmc` | `index_cmc` | `WaveBone_6` |
| 7 | `index_mcp` | `index_mcp` | `WaveBone_7` |
| 8 | `index_pip` | `index_pip` | `WaveBone_8` |
| 9 | `index_dip` | `index_dip` | `WaveBone_9` |
| 10 | `index_tip` | `index_tip` | `WaveBone_10` |
| 11 | `middle_cmc` | `middle_cmc` | `WaveBone_11` |
| 12 | `middle_mcp` | `middle_mcp` | `WaveBone_12` |
| 13 | `middle_pip` | `middle_pip` | `WaveBone_13` |
| 14 | `middle_dip` | `middle_dip` | `WaveBone_14` |
| 15 | `middle_tip` | `middle_tip` | `WaveBone_15` |
| 16 | `ring_cmc` | `ring_cmc` | `WaveBone_16` |
| 17 | `ring_mcp` | `ring_mcp` | `WaveBone_17` |
| 18 | `ring_pip` | `ring_pip` | `WaveBone_18` |
| 19 | `ring_dip` | `ring_dip` | `WaveBone_19` |
| 20 | `ring_tip` | `ring_tip` | `WaveBone_20` |
| 21 | `pinky_cmc` | `little_cmc` | `WaveBone_21` |
| 22 | `pinky_mcp` | `little_mcp` | `WaveBone_22` |
| 23 | `pinky_pip` | `little_pip` | `WaveBone_23` |
| 24 | `pinky_dip` | `little_dip` | `WaveBone_24` |
| 25 | `pinky_tip` | `little_tip` | `WaveBone_25` |

The naming differences at wrist, thumb IP/DIP, and little/pinky are intentional. Packet order and bone IDs are the reliable mapping.

## Appearance and materials

The model has separate skin and glove material slots:

- Skin: matte `MeshLambertMaterial`, base colour `#e0a38f`
- Glove: matte `MeshLambertMaterial` using the SDK's matching `RealityL.png` or `RealityR.png`

The original FBX contains Unity-side texture references that a browser cannot resolve. The local bridge serves the SDK textures explicitly, and `TextureLoader` assigns the correct texture to the glove material.

Changing material colour, texture, lighting, or CSS must not modify:

- Bone positions
- Bone rotations
- Joint mapping
- Finger spacing
- Thumb placement
- Kinematic processing

If geometry changes after a visual-theme edit, inspect the rig transformation code and asset loading separately; the colour itself cannot alter the skeleton.

## Camera and presentation

The rig uses an orthographic camera to avoid perspective distortion:

```text
camera position: (0, 0, 10)
view height: 4.15
live fit target: 3.46
guidance fit target: 3.58
```

The transformed model's complete bounding box is calculated before scaling and centring. This prevents the wrist or fingertips from being cropped.

The display root rotates the hand into a vertical, palm-facing presentation. Left and right hands use small mirrored yaw and roll offsets.

## Live rig versus guidance rig

The same model component has two distinct modes:

1. **Live rig:** Applies the 26 SDK joint transforms directly. No authored animation or correction is added.
2. **Guidance rig:** Uses the FBX rest pose and controlled animation to demonstrate pronation/supination, circumduction, or hand open/close.

Guidance animation must never run on top of live sensor transforms. The modes are mutually exclusive through `guidanceMode`.

Current authored guidance rules:

- Basic calibration uses the original 300-frame `Basic.json` sequence shipped
  with XR Game for the selected hand. It loops on its own authored timeline;
  SDK calibration percentage drives only the progress bar and must never seek
  or freeze the instructional hand animation.
- Hand open/close curls only the index, middle, ring, and pinky joints around
  negative local X. The thumb stays in its neutral extended pose, matching the
  supplied exercise recording.
- Wrist circumduction holds the same four-finger closed pose and moves through
  one clockwise circle followed by one anticlockwise circle. The reversal is
  eased to avoid a direction snap.
- Pronation/supination remains an overhead half-turn between palm-down and
  palm-up states.
- These transforms belong only to the movement guide and must not be copied
  into the live sensor branch.

## Validation evidence

The raw live packet was compared against all 26 bones in `LeftHandAnims.FBX`:

- Bone count: 26
- Joint count: 26
- Maximum position discrepancy after multiplying OSC positions by 100: approximately `0.000001` FBX units
- Palm, hand/wrist, index CMC, middle CMC, ring CMC, and pinky CMC quaternion agreement: absolute dot product `1.000000`

Quaternion `q` and `-q` describe the same rotation, so sign-equivalent quaternion values are valid.

## Rules for future changes

Do not reintroduce any of the following without evidence from a newer SDK:

- `restQuaternion * incomingQuaternion` for live joints
- Per-finger quaternion component scaling
- Manual CMC/MCP splay attenuation
- Manual thumb lift or thumb-base correction
- Hard-coded changes to finger positions
- Unity coordinate sign conversion in the Three.js renderer
- Ignoring palm or hand/wrist packet entries
- Deriving the live rig from slider values when the 26-joint kinematic packet is available

When upgrading the SDK, repeat these checks before changing the web rig:

1. Inspect the SDK joint visualiser and OSC receiver.
2. Confirm packet order and names.
3. Compare all FBX local positions with streamed positions and determine unit scale.
4. Compare quaternions using absolute dot products rather than component equality.
5. Test open hand, closed fist, thumb opposition, finger flexion, and finger splay.
6. Keep appearance changes isolated from skeleton and telemetry logic.

## Build verification

From `glove-dashboard`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

The build passed after the current SDK-equivalent transformation logic was installed.
