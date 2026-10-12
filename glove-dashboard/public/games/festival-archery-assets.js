import * as THREE from './lib/three.module.min.js';

// Teal Festival concept rebuilt as meshes, not a static preview image.
const material = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({color,roughness});

export function shieldImpactPose(age, reducedMotion = false) {
  const strength = Math.max(0, 1 - age / 0.65);
  if(!strength || reducedMotion) return {twist:0,recoil:0,scale:1};
  return {
    twist: reducedMotion ? 0 : Math.sin(age * 47) * strength * 0.12,
    recoil: reducedMotion ? 0 : Math.sin(age * 30) * strength * 0.11,
    scale: reducedMotion ? 1 : 1 + Math.sin(Math.min(age / 0.18, 1) * Math.PI) * strength * 0.055,
  };
}

export function createFestivalBow() {
  const root = new THREE.Group();
  // Three-quarter first-person placement keeps the arrow seated at the grip,
  // while still showing the broad limb faces instead of an end-on silhouette.
  const yaw=1.05, sin=Math.sin(yaw), cos=Math.cos(yaw);
  root.position.set(0.72*cos-0.18*sin,2.2,3.8);
  root.rotation.y=yaw;
  const wood = material(0xbc834b,0.67), teal = material(0x166b6e), cream=material(0xf5e3be);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62,-1.38,0.06),new THREE.Vector3(-0.58,-1.15,-0.08),
    new THREE.Vector3(-0.28,-0.73,-0.14),new THREE.Vector3(-0.06,-0.35,-0.04),
    new THREE.Vector3(0,0,0),new THREE.Vector3(-0.06,0.35,-0.04),
    new THREE.Vector3(-0.28,0.73,-0.14),new THREE.Vector3(-0.58,1.15,-0.08),
    new THREE.Vector3(-0.62,1.38,0.06)]);
  // Rounded rectangular section: broad, tapered laminated limbs rather than tubes.
  const cross=[[-1,-0.65],[-0.65,-1],[0.65,-1],[1,-0.65],[1,0.65],[0.65,1],[-0.65,1],[-1,0.65]];
  const vertices=[],indices=[];
  const steps=72;
  for(let i=0;i<=steps;i++) {
    const t=i/steps,p=curve.getPoint(t),v=curve.getTangent(t);
    const normal=new THREE.Vector3(v.y,-v.x,0).normalize();
    const width=0.06+0.065*Math.sin(t*Math.PI);
    for(const [x,z] of cross) vertices.push(p.x+normal.x*x*width,p.y+normal.y*x*width,p.z+z*0.045);
    if(i<steps) for(let j=0;j<8;j++) {
      const a=i*8+j,b=i*8+(j+1)%8,c=a+8,d=b+8;
      indices.push(a,c,b,b,c,d);
    }
  }
  for(let j=1;j<7;j++) {indices.push(0,j+1,j);const last=steps*8;indices.push(last,last+j,last+j+1);}
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const resting=geometry.attributes.position.array.slice();
  root.add(new THREE.Mesh(geometry,wood));
  // Subtle lamination lines follow the real limb profile.
  const grain=[];
  for(const offset of [-0.05,0.035]) {
    const points=Array.from({length:73},(_,i)=>{const p=curve.getPoint(i/72);p.x+=offset;p.z+=0.047;return p;});
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:offset<0?0xe4b77c:0x986038}));
    grain.push({line,rest:line.geometry.attributes.position.array.slice()});root.add(line);
  }
  const grip=new THREE.Mesh(new THREE.CapsuleGeometry(0.145,0.29,8,16),teal);
  grip.scale.z=0.85;root.add(grip);
  const rest=new THREE.Mesh(new THREE.BoxGeometry(0.28,0.035,0.28),cream);
  rest.position.set(-0.09,0.14,-0.09);root.add(rest);
  for(let i=0;i<7;i++) {
    const seam=new THREE.Mesh(new THREE.TorusGeometry(0.148,0.009,6,24),material(0x2b8988));
    seam.rotation.set(Math.PI/2,0,0.10);seam.position.y=-0.24+i*0.08;root.add(seam);
  }
  for(const y of [-0.34,0.34]) {
    const binding=new THREE.Mesh(new THREE.CylinderGeometry(0.133,0.133,0.09,16),cream);
    binding.position.y=y;root.add(binding);
  }
  const stringGeometry=new THREE.BufferGeometry();
  stringGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3));
  root.add(new THREE.Line(stringGeometry,new THREE.LineBasicMaterial({color:0xffedd0})));
  let previous=-1;
  function draw(amount) {
    amount=THREE.MathUtils.clamp(amount,0,1);
    if(Math.abs(amount-previous)<0.001)return;
    previous=amount;
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
      const y=resting[i*3+1];
      const bend=amount*0.24*Math.pow(Math.abs(y)/1.38,1.6);
      positions.setXYZ(i,resting[i*3]-bend*sin,y,resting[i*3+2]+bend*cos);
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
    for(const {line,rest} of grain) {
      const a=line.geometry.attributes.position;
      for(let i=0;i<a.count;i++) {
        const bend=amount*0.24*Math.pow(Math.abs(rest[i*3+1])/1.38,1.6);
        a.setX(i,rest[i*3]-bend*sin);a.setZ(i,rest[i*3+2]+bend*cos);
      }
      a.needsUpdate=true;line.geometry.computeBoundingSphere();
    }
    const tipX=-0.62-amount*0.24*sin,tipZ=0.06+amount*0.24*cos;
    stringGeometry.attributes.position.array.set([tipX,-1.38,tipZ,-0.72-amount*0.65*sin,0.14,0.18+amount*0.65*cos,tipX,1.38,tipZ]);
    stringGeometry.attributes.position.needsUpdate=true;stringGeometry.computeBoundingSphere();
  }
  function nock(arrow,amount) {
    const tail=root.localToWorld(new THREE.Vector3(-0.72-amount*0.65*sin,0.14,0.18+amount*0.65*cos));
    const direction=new THREE.Vector3(0,3.3,0).sub(tail).normalize();
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
    arrow.position.copy(tail).addScaledVector(direction,0.8);
  }
  draw(0);
  return {root,draw,nock};
}

export function createFestivalArrow() {
  const arrow=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.023,0.026,1.6,12),material(0xd6a063));
  shaft.rotation.x=Math.PI/2;arrow.add(shaft);
  const point=new THREE.Mesh(new THREE.ConeGeometry(0.105,0.26,4),
    new THREE.MeshStandardMaterial({color:0xc7d8de,metalness:0.5,roughness:0.4}));
  point.rotation.x=-Math.PI/2;point.position.z=-0.93;arrow.add(point);
  const feather=new THREE.Shape();
  feather.moveTo(0,0);feather.quadraticCurveTo(0.24,0.02,0.19,0.18);feather.lineTo(0.12,0.4);feather.lineTo(0,0.33);
  for(let i=0;i<3;i++) {
    const fin=new THREE.Mesh(new THREE.ShapeGeometry(feather),
      new THREE.MeshStandardMaterial({color:i===0?0xea8475:0x167b7e,roughness:0.9,side:THREE.DoubleSide}));
    const pivot=new THREE.Group();pivot.rotation.z=i*Math.PI*2/3;
    fin.rotation.x=Math.PI/2;fin.position.z=0.43;pivot.add(fin);arrow.add(pivot);
  }
  return arrow;
}

export function createFestivalShield() {
  const root=new THREE.Group();
  const faceMaterial=material(0xe88a7e),cream=material(0xf7e6c7),teal=material(0x18797b);
  const face=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),faceMaterial);
  face.scale.set(0.57,0.77,0.13);root.add(face);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(0.57,0.085,12,48),cream);
  rim.scale.y=1.34;root.add(rim);
  const target=new THREE.Mesh(new THREE.TorusGeometry(0.29,0.04,10,40),cream);
  target.scale.y=1.18;target.position.z=0.132;root.add(target);
  for(let i=0;i<6;i++) {
    const angle=i*Math.PI/3;
    const strap=new THREE.Mesh(new THREE.CapsuleGeometry(0.06,0.13,6,12),teal);
    strap.position.set(Math.cos(angle)*0.57,Math.sin(angle)*0.76,0.04);
    strap.rotation.z=angle;root.add(strap);
  }
  const stitches=[];
  for(let i=0;i<80;i++) {
    const a=i*Math.PI*2/80,b=a+0.025;
    stitches.push(new THREE.Vector3(Math.cos(a)*0.50,Math.sin(a)*0.68,0.10),new THREE.Vector3(Math.cos(b)*0.50,Math.sin(b)*0.68,0.10));
  }
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(stitches),new THREE.LineBasicMaterial({color:0xffd9b6})));
  root.position.set(4.3,3.3,1.1);
  return {root,faceMaterial};
}
