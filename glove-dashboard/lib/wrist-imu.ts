import {Quaternion, Euler, MathUtils} from 'three';

export type ImuQuaternion = {x:number;y:number;z:number;w:number};

// OSC IMU -> Unity OnOrientation (-y,-z,x,w), then Unity -> source-FBX
// coordinates (x,-y,-z,w), matching the inverse of OnKinematic's reflection.
// This conversion is ONLY for the separate IMU packet, not finger quaternions.
export function imuToFbx(input?: ImuQuaternion | null): Quaternion | null {
  if(!input || ![input.x,input.y,input.z,input.w].every(Number.isFinite)) return null;
  const q=new Quaternion(-input.y,input.z,-input.x,input.w);
  if(q.lengthSq()<1e-12) return null;
  return q.normalize();
}

export class WristImuPose {
  private neutral: Quaternion | null = null;
  private resetAt = 0;
  private last = new Quaternion();
  reset() {this.neutral=null;this.resetAt=0;this.last.identity();}
  // The vendor tare command changes the upstream orientation. Hold the display
  // neutral briefly, then capture the latest live packet, not a pre-command pose.
  requestTare(now:number) {this.neutral=null;this.resetAt=now+350;this.last.identity();}
  update(input:ImuQuaternion | null | undefined,now:number):Quaternion | null {
    const incoming=imuToFbx(input);
    if(!incoming) return null;
    if(now<this.resetAt) return this.last;
    if(!this.neutral) this.neutral=incoming.clone();
    // Unity ImuConfiguration: inverse(tare/drift offset) * glove orientation.
    // Keep this offset fixed until tare, rather than rubberbanding held poses away.
    this.last.copy(this.neutral).invert().multiply(incoming).normalize();
    return this.last;
  }
}

export function wristRollDegrees(delta:Quaternion):number {
  // The source FBX's forearm runs along Z. Euler Z is a display roll angle,
  // not a clinical measurement or an exercise-detection input.
  return MathUtils.radToDeg(new Euler().setFromQuaternion(delta,'XYZ').z);
}
