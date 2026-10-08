'use client';

import { Activity, Hand } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Vector3 = { x: number; y: number; z: number };
type Quaternion = Vector3 & { w: number };
type Header = Record<string, string | number>;
type Joint = { name: string; position: Vector3; orientation: Quaternion };

export type InspectorHandState = {
  orientation?: { header: Header; accelerometer: Vector3; orientation: Quaternion } | null;
  controller?: { header: Header; inputs: Record<string, number> } | null;
  sliders?: Record<string, number>;
  reverse_sliders?: Record<string, number>;
  kinematic?: { header: Header; joints: Joint[] } | null;
  gesture_state?: unknown;
  articulation_state?: unknown;
  tracker_offset_calibration?: unknown;
  tracker_offset?: unknown;
  tracker_location?: unknown;
  tracker_source?: unknown;
  button_passthrough?: unknown;
  mvn_output_bones?: Record<string, unknown>;
};

function number(value: unknown, precision = 5) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(precision) : '—';
}

function FieldGrid({ values }: { values: Record<string, unknown> }) {
  return <div className="sensor-field-grid">{Object.entries(values).map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><code>{typeof value === 'number' ? number(value) : String(value)}</code></div>)}</div>;
}

export function HandStateInspector({ hand, side }: { hand?: InspectorHandState; side: 'LEFT' | 'RIGHT' }) {
  const header = hand?.kinematic?.header ?? hand?.orientation?.header ?? hand?.controller?.header ?? {};
  const joints = hand?.kinematic?.joints ?? [];
  const imu = hand?.orientation;

  return <section className="all-sensors" id="all-sensors">
    <div className="sensor-section-heading">
      <div><span className="eyebrow">HANDSTATEMANAGER · SENSOR SNAPSHOT</span><h2>{side.charAt(0) + side.slice(1).toLowerCase()} glove — kinematic and IMU data</h2></div>
      <span className="sensor-count">{joints.length} JOINTS</span>
    </div>

    <div className="sensor-summary-grid">
      <article className="sensor-card"><div className="sensor-card-title"><Hand /><strong>PACKET HEADER</strong></div><FieldGrid values={header} /></article>
      <article className="sensor-card"><div className="sensor-card-title"><Activity /><strong>IMU SENSOR</strong></div>{imu ? <FieldGrid values={{ accel_x: imu.accelerometer.x, accel_y: imu.accelerometer.y, accel_z: imu.accelerometer.z, quat_x: imu.orientation.x, quat_y: imu.orientation.y, quat_z: imu.orientation.z, quat_w: imu.orientation.w }} /> : <p className="empty-channel">Waiting for orientation data</p>}</article>
    </div>

    <article className="sensor-table-card" id="joints">
      <div className="sensor-table-title"><Hand /><div><strong>ALL KINEMATIC JOINTS</strong><small>Palm, hand, CMC, MCP, PIP, DIP and TIP · position XYZ + quaternion XYZW</small></div><span>{joints.length} rows</span></div>
      <Table className="telemetry-table">
        <TableHeader><TableRow><TableHead>Joint</TableHead><TableHead>Segment</TableHead><TableHead>Pos X</TableHead><TableHead>Pos Y</TableHead><TableHead>Pos Z</TableHead><TableHead>Quat X</TableHead><TableHead>Quat Y</TableHead><TableHead>Quat Z</TableHead><TableHead>Quat W</TableHead></TableRow></TableHeader>
        <TableBody>{joints.map((joint) => {
          const parts = joint.name.split('_');
          const segment = parts.length > 1 ? parts.at(-1)!.toUpperCase() : 'ROOT';
          return <TableRow key={joint.name}><TableCell className="joint-name">{joint.name}</TableCell><TableCell><span className={`segment-tag segment-${segment.toLowerCase()}`}>{segment}</span></TableCell><TableCell>{number(joint.position.x)}</TableCell><TableCell>{number(joint.position.y)}</TableCell><TableCell>{number(joint.position.z)}</TableCell><TableCell>{number(joint.orientation.x)}</TableCell><TableCell>{number(joint.orientation.y)}</TableCell><TableCell>{number(joint.orientation.z)}</TableCell><TableCell>{number(joint.orientation.w)}</TableCell></TableRow>;
        })}</TableBody>
      </Table>
      {!joints.length && <p className="empty-channel">Waiting for kinematic joint data</p>}
    </article>

  </section>;
}
