# Neuro-Glove Rehabilitation Suite: Clinical Games and Exercise Protocol Guide

## 1. Clinical Overview and Exercise Mapping Matrix

The Neuro-Glove Rehabilitation Suite translates therapeutic upper-extremity motor exercises into engaging, sensor-driven 3D interactive rehabilitation environments. Designed for post-stroke hemiparesis, traumatic brain injury (TBI), carpal tunnel recovery, and neuromuscular re-education, each game is specifically mapped to an isolated or compound anatomical motion protocol.

All patient interactions are executed strictly through physical hand, finger, and wrist movements captured in real-time by the StretchSense sensor-instrumented rehabilitation gloves.

### Clinical Exercise Protocol Summary

| Game Title | Target Rehabilitation Exercise | Primary Anatomical Motions | Target Pathologies | Sensor Telemetry |
| :--- | :--- | :--- | :--- | :--- |
| **Gelato Tower** | Forearm Pronation / Supination | Internal and external forearm rotation around the longitudinal axis | Post-stroke spasticity, distal radius fracture stiffness, hemiplegic synergy patterns | Roll angle IMU (-45° to +45°) |
| **Balloon Blitz** | Hand Open / Close (Grasp & Extension) | Metacarpophalangeal (MCP) and interphalangeal (IP) flexion and extension | Radial nerve palsy, extensor weakness, grasp-release deficit, flexor hypertonia | 5-channel stretch bend sensors (0% to 100%) |
| **Pizza Spin** | Wrist Circumduction | Multi-planar circular carpal motion (flexion, deviation, extension) | Carpal tunnel post-op, radiocarpal contracture, limited functional arc of motion | Multi-axis carpal trajectory (0° to 360°) |
| **Rolling Wonder** | Dynamic Compound Coordination | Wrist tilt steering, rapid finger extension leaping, 360° circumduction turbo | Complex motor coordination, cognitive-motor dual tasking, dynamic stability | Multi-sensor integration (IMU + flex sensors) |

---

## 2. Game 1: Gelato Tower

### Forearm Pronation and Supination Protocol

![Gelato Tower - Forearm Pronation and Supination Protocol](./screenshots/gelato_tower_screenshot.png)

### Clinical Rationale & Target Pathology
Forearm rotation (pronation and supination) is vital for daily activities such as turning keys, handling utensils, holding a cup, and using doorknobs. Stroke survivors often exhibit flexor synergy, trapping the forearm in fixed pronation or limiting active supination. Gelato Tower encourages repetitive, controlled rotational range of motion (ROM) through a dynamic balancing challenge.

### Targeted Muscle Groups
- **Forearm Pronation**: Pronator teres, pronator quadratus, flexor carpi radialis assist.
- **Forearm Supination**: Supinator, biceps brachii, brachioradialis (neutral recovery).

### How to Play Using Rehabilitation Gloves

#### 1. Patient Posture & Ergonomic Setup
- Position the patient comfortably upright with the upper arm stabilized against the torso.
- Flex the elbow to 90 degrees with the forearm supported on a padded therapy rest or table surface.
- The neutral baseline position (0° tilt) is established with the thumb pointed directly upward toward the ceiling.

#### 2. Pronation Motor Execution (Tilt Cone Left)
- Slowly rotate the forearm inward so that the palm begins facing downward toward the table surface.
- The glove orientation sensor registers negative roll angle degrees.
- In-game effect: The waffle cone tilts smoothly to the left to position the rim underneath falling gelato scoops on the left side of the screen.

#### 3. Supination Motor Execution (Tilt Cone Right)
- Slowly rotate the forearm outward so that the palm turns upward toward the ceiling.
- The glove orientation sensor registers positive roll angle degrees.
- In-game effect: The waffle cone tilts smoothly to the right to intercept falling gelato scoops on the right side of the screen.

#### 4. Neutral Return and Dynamic Balance
- Return the forearm to the upright vertical thumb-up position (0°) to center the cone.
- As scoops stack higher, center of mass shifts dynamically. The patient must execute subtle, fine-motor counter-rotations to prevent the tower from toppling.

### Biofeedback & Progressive Levels
- **Telemetry Gauge**: Top-right HUD displays active forearm rotation angle in real time (-45° to +45°) with a visual balance tracker.
- **Level Progression (Levels 1 to 5)**:
  - *Level 1 (Vanilla Coast)*: Slow fall rate, wide tolerance window, target: 8 caught scoops.
  - *Level 2 (Pistachio Park)*: Moderate fall rate, introduced gentle stack sway, target: 12 caught scoops.
  - *Level 3 (Berry Mountain)*: Increased speed, wider spawn variance, target: 16 caught scoops.
  - *Level 4 (Golden Sunset)*: Dynamic drift, active counter-balance required, target: 20 caught scoops.
  - *Level 5 (Grand Gelateria)*: High speed, rapid alternate-quadrant spawns, target: 25 caught scoops.

---

## 3. Game 2: Balloon Blitz

### Hand Open and Close Protocol (Grasp & Extension Therapy)

![Balloon Blitz - Hand Open and Close Grasp and Extension Therapy](./screenshots/balloon_blitz_screenshot.png)

### Clinical Rationale & Target Pathology
Functional hand use requires coordinated alternation between digital flexion (cylindrical and power grasp) and active digital extension (releasing objects). In patients with neurological insults or radial nerve injuries, finger extension is frequently impaired while flexors remain hypertonic. Balloon Blitz provides structured biofeedback that demands voluntary graded flexion followed by complete active extension.

### Targeted Muscle Groups
- **Digital Flexion (Grasp)**: Flexor digitorum superficialis, flexor digitorum profundus, flexor pollicis longus, intrinsic lumbricals.
- **Digital Extension (Open Hand)**: Extensor digitorum communis, extensor indicis, extensor digiti minimi, abductor pollicis longus.

### How to Play Using Rehabilitation Gloves

#### 1. Patient Posture & Ergonomic Setup
- Patient seated with the forearm resting on an armrest or flat therapy table in a comfortable neutral pronation position.
- Fingers relaxed in a resting semi-flexed posture.

#### 2. Hand Grasp (Close Fist) to Pump Air
- Firmly curl all four fingers and thumb into a closed fist.
- The StretchSense glove flex sensors detect multi-digit flexion above the trigger threshold (>55% bend).
- In-game effect: Actuates the red pneumatic pump piston, forcing air into the balloon and increasing balloon volume.
- Repeated rhythmic open-close pumping cycles allow gradual air accumulation.

#### 3. Controlled Inflation Volume
- Observe the central clinical telemetry HUD:
  - *Low Zone (0% to 69%)*: Balloon is under-inflated and will not earn target points.
  - *Target Green Window (70% to 85%)*: Optimal therapeutic threshold. Earns perfect score, high tickets, and level progression.
  - *Over-Inflation Warning (86% to 94%)*: High tension state.
  - *Burst Limit (95% to 100%)*: If pumped past 95%, the balloon bursts and resets the combo multiplier. This trains inhibitory muscle control against uncontrolled spastic clenches.

#### 4. Hand Extension (Open Hand Wide) to Release and Launch
- Spread all five fingers open as wide as possible into maximal extension.
- The glove sensors register sensor relaxation below the release threshold (<25% bend).
- In-game effect: The balloon nozzle is securely tied off and launches upward into the sky with an ascending audio chime.

### Biofeedback & Progressive Levels
- **Telemetry Gauge**: Top-right HUD displays instantaneous digital tension status (OPEN, PARTIAL, GRASP) alongside a real-time inflation volume meter.
- **Level Progression (Levels 1 to 5)**:
  - *Level 1 (Meadow Carnival)*: Broad green target window (65% to 85%), target: 6 successful balloons.
  - *Level 2 (Spring Fair)*: Target window (70% to 85%), faster air retention, target: 9 successful balloons.
  - *Level 3 (Skyway Fiesta)*: Narrower target window (72% to 84%), target: 12 successful balloons.
  - *Level 4 (Twilight Bazaar)*: Sensitive pump rate requiring deliberate fine motor pacing, target: 15 successful balloons.
  - *Level 5 (Grand Gala)*: Precision window (75% to 83%), rapid burst limit, target: 18 successful balloons.

---

## 4. Game 3: Pizza Spin

### Wrist Circumduction Protocol (Multi-Planar Carpal Mobility)

![Pizza Spin - Wrist Circumduction Multi-Planar Carpal Mobility](./screenshots/pizza_spin_screenshot.png)

### Clinical Rationale & Target Pathology
Wrist circumduction is a composite motion combining sagittal (flexion/extension) and frontal (radial/ulnar deviation) carpal kinematics. Patients recovering from wrist immobilization, carpal tunnel surgery, or wrist arthrofibrosis often demonstrate restricted, angular, or jerky wrist motions. Pizza Spin trains continuous, smooth circular coordination across the full articular perimeter.

### Targeted Muscle Groups
- **Flexor Group**: Flexor carpi radialis, flexor carpi ulnaris.
- **Extensor Group**: Extensor carpi radialis longus, extensor carpi radialis brevis, extensor carpi ulnaris.
- **Coordinated Sequential Firing**: Progressive smooth hand-off between flexors, deviators, and extensors through 360 degrees.

### How to Play Using Rehabilitation Gloves

#### 1. Patient Posture & Ergonomic Setup
- Patient forearm supported horizontally on the therapy table with the wrist joint positioned freely past the table edge or elevated on a soft support pad.
- Hand oriented palm down, fingers relaxed in functional alignment.

#### 2. Tracing Smooth 360° Circular Motions
- Guide the hand through a continuous, fluid circular pathway at the wrist without translating the elbow or shrugging the shoulder.
- The motion moves smoothly through:
  1. *Wrist Extension* (slight upward lift)
  2. *Radial Deviation* (tilt toward thumb)
  3. *Wrist Flexion* (gentle downward drop)
  4. *Ulnar Deviation* (tilt toward little finger)
  5. *Return to Extension* (completing the full 360° circle).

#### 3. Glove Sensor Detection
- Glove IMU sensors track integrated angular displacement around the carpal pivot.
- As the patient rotates, the top-right circular progress indicator fills incrementally from 0% to 100%.
- Clockwise or counter-clockwise directions are both supported based on the clinical rotation directive.

#### 4. Stretching the Pizza Crust
- Each completed 360° rotation cycle represents 1 full therapeutic repetition.
- In-game effect: The pizza dough spins smoothly on the peel, expanding in diameter toward the target crust size (14 inches).
- Topping bowls deliver ingredients as milestone diameters are achieved.

### Biofeedback & Progressive Levels
- **Telemetry Gauge**: Top-right HUD displays circular angle progression (0° to 360°) and completed repetition count.
- **Level Progression (Levels 1 to 5)**:
  - *Level 1 (Trattoria Rustica)*: Target diameter: 12 inches (requires 4 completed rotations).
  - *Level 2 (Napoli Classic)*: Target diameter: 14 inches (requires 6 completed rotations).
  - *Level 3 (Firenze Gourmet)*: Target diameter: 16 inches (requires 8 completed rotations).
  - *Level 4 (Venezia Master)*: Target diameter: 18 inches (requires 10 completed rotations).
  - *Level 5 (Grand Pizzeria)*: Target diameter: 20 inches (requires 12 completed rotations).

---

## 5. Game 4: Rolling Wonder

### Dynamic Multi-Motion Agility and Compound Coordination

![Rolling Wonder - Dynamic Multi-Motion Agility and Compound Coordination](./screenshots/rolling_wonder_screenshot.png)

### Clinical Rationale & Target Pathology
Functional recovery ultimately depends on transitioning from isolated joint exercises to fluid compound movements. Rolling Wonder integrates lateral wrist deviation/tilt, rapid hand extension leaps, and high-velocity wrist circumduction into an interactive continuous track runner featuring Pip the hamster in a transparent exercise sphere.

### Targeted Muscle Groups
- **Multi-segmental Coordination**: Carpal deviators (radial/ulnar), wrist extensors/flexors, and intrinsic digit extensors performing rapid motor switching.

### How to Play Using Rehabilitation Gloves

#### 1. Patient Posture & Ergonomic Setup
- Seated or standing with forearm in active functional posture, held above the therapy surface to allow multi-axial mobility.

#### 2. Lateral Wrist Tilt (Steering Motion)
- **Tilt Wrist Left**: Execute gentle leftward wrist deviation / pronation bias to steer the hamster ball toward the left track lane.
- **Tilt Wrist Right**: Execute gentle rightward wrist deviation / supination bias to steer the hamster ball toward the right track lane.
- In-game effect: Smooth lateral lane repositioning to collect floating rainbow gems and avoid obstacles.

#### 3. Rapid Hand Extension (Leap / Jump Motion)
- From a relaxed posture, snap all fingers and thumb wide open into full digital extension.
- Glove flex sensors detect sudden extensor recruitment.
- In-game effect: Propels the hamster ball upward into a high vertical leap, clearing ground obstacles (mushrooms and track hurdles) and collecting elevated golden stars.

#### 4. Circular Wrist Whirl (Rainbow Turbo Boost)
- Rotate the wrist in a rapid 360° circular circumduction.
- In-game effect: Ignites Rainbow Turbo propulsion, accelerating forward velocity to 45 km/h and triggering an invincible star streak.

### Biofeedback & Progressive Levels
- **Telemetry Gauge**: Real-time HUD tracks velocity (km/h), collected stars, active movement state (ROLLING CRUISE, EXTENSION JUMP, TURBO WHIRL), and level completion progress.
- **Level Progression (Levels 1 to 5)**:
  - *Level 1 (Sunny Meadow)*: 120m course, slow base speed, wide pathways, target: 800 points.
  - *Level 2 (Daisy Fields)*: 150m course, introduced rolling mushroom barriers, target: 1,200 points.
  - *Level 3 (Crystal Stream)*: 180m course, undulating tracks, elevated star rings, target: 1,600 points.
  - *Level 4 (Twilight Hills)*: 210m course, narrow tracks with consecutive hurdles, target: 2,000 points.
  - *Level 5 (Rainbow Peak)*: 250m course, high velocity, compound jumping and steering requirements, target: 2,500 points.

---

## 6. Clinical Best Practices & Session Guidelines

### 1. Pre-Session Tare and Calibration
- Before initiating any game, instruct the patient to assume their natural resting neutral posture.
- Verify through the glove connectivity modal that all 5 sensor bend channels read within baseline resting parameters and that the IMU roll angle is centered at 0°.

### 2. Guarding Against Synergistic Compensations
- Post-stroke patients frequently compensate for limited forearm supination by abducting the shoulder or leaning the torso laterally.
- Ensure the elbow remains close to the flank at approximately 90 degrees of flexion throughout Gelato Tower and Pizza Spin. Use an elbow support block if unprompted shoulder elevation occurs.

### 3. Monitoring Fatigue and Spasticity
- Observe the patient for signs of flexor synergy fatigue (inability to release grasp in Balloon Blitz or unintended hand curling in Rolling Wonder).
- Schedule brief 30-to-60 second rest pauses between level completions to prevent muscle cramping or spastic hypertonicity.

### 4. Objective Telemetry Documentation
- All reps, completed rotational degrees, grasp cycles, and session durations are recorded automatically to the clinical directory. Clinicians can review progress trend charts across longitudinal therapy sessions.
