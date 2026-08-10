/**
 * Level 3 — 迷宫中央通天光柱（强可见、通向天空，不受雾遮挡）
 */
import * as THREE from "three";
import { CELL, MAZE_W, MAZE_H, WALL_H } from "./backrooms-level3-world.js";

export const ELEVATOR_INTERACT_DIST = 3.2;
const SHAFT_W = 3.0;
const BEAM_H = 72;

var _beamTex = null;
function skyBeamTexture() {
  if (_beamTex) return _beamTex;
  var cw = 128;
  var ch = 512;
  var canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var y;
  for (y = 0; y < ch; y++) {
    var t = y / (ch - 1);
    var core = Math.pow(1 - t, 0.28);
    var aCore = Math.min(1, core * (0.35 + t * 0.95));
    ctx.fillStyle = "rgba(255,255,255," + aCore.toFixed(3) + ")";
    ctx.fillRect(cw * 0.5 - 10 * core - 3, y, 20 * core + 6, 2);
    ctx.fillStyle = "rgba(180,220,255," + (core * 0.55).toFixed(3) + ")";
    ctx.fillRect(cw * 0.5 - 28 * core, y, 56 * core, 1);
    ctx.fillStyle = "rgba(120,180,255," + (core * 0.25).toFixed(3) + ")";
    ctx.fillRect(cw * 0.5 - 40 * core, y, 80 * core, 1);
  }
  _beamTex = new THREE.CanvasTexture(canvas);
  _beamTex.colorSpace = THREE.SRGBColorSpace;
  return _beamTex;
}

var _floorGlowTex = null;
function floorGlowTexture() {
  if (_floorGlowTex) return _floorGlowTex;
  var size = 256;
  var canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  var g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(220,245,255,0.9)");
  g.addColorStop(0.55, "rgba(140,200,255,0.35)");
  g.addColorStop(1, "rgba(80,140,220,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _floorGlowTex = new THREE.CanvasTexture(canvas);
  _floorGlowTex.colorSpace = THREE.SRGBColorSpace;
  return _floorGlowTex;
}

function glowBasic(opts) {
  return new THREE.MeshBasicMaterial(
    Object.assign(
      {
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      },
      opts
    )
  );
}

export function getLevel3ElevatorWorldCenter() {
  var mid = Math.floor(MAZE_W * 0.5) - 2;
  var cell = mid + 1.5;
  return {
    x: (cell - MAZE_W * 0.5) * CELL,
    z: (cell - MAZE_H * 0.5) * CELL,
  };
}

/**
 * @param {THREE.Group} parent
 */
export function buildLevel3ElevatorShaft(parent) {
  var center = getLevel3ElevatorWorldCenter();
  var group = new THREE.Group();
  group.name = "L3ElevatorShaft";
  group.position.set(center.x, 0, center.z);

  var beamMap = skyBeamTexture();
  var floorMap = floorGlowTexture();

  var beams = [];
  function addBeam(w, h, rotY, opacityMul) {
    var mat = glowBasic({
      map: beamMap || undefined,
      color: beamMap ? 0xffffff : 0xf0f8ff,
      opacity: 0.95 * (opacityMul || 1),
      side: THREE.DoubleSide,
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.y = h * 0.5 + 0.05;
    mesh.rotation.y = rotY;
    mesh.renderOrder = 20;
    group.add(mesh);
    beams.push(mesh);
    return mesh;
  }

  beams.push(addBeam(5.5, BEAM_H, 0, 1));
  beams.push(addBeam(5.5, BEAM_H, Math.PI * 0.5, 1));
  beams.push(addBeam(4.2, BEAM_H * 0.96, Math.PI * 0.25, 0.7));
  beams.push(addBeam(4.2, BEAM_H * 0.96, -Math.PI * 0.25, 0.7));

  var core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 1.45, BEAM_H, 24, 1, true),
    glowBasic({ color: 0xffffff, opacity: 0.62, side: THREE.DoubleSide })
  );
  core.position.y = BEAM_H * 0.5;
  core.renderOrder = 21;
  group.add(core);

  var skyRings = [];
  var ri;
  for (ri = 0; ri < 10; ri++) {
    var ringY = 3 + ri * (BEAM_H / 10);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5 + ri * 0.08, 1.35 + ri * 0.12, 32),
      glowBasic({ color: 0xd8eeff, opacity: 0.35 - ri * 0.02, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.y = ringY;
    ring.renderOrder = 19;
    group.add(ring);
    skyRings.push(ring);
  }

  var groundGlow = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 56),
    glowBasic({
      map: floorMap || undefined,
      color: 0xffffff,
      opacity: 0.95,
    })
  );
  groundGlow.rotation.x = -Math.PI * 0.5;
  groundGlow.position.y = 0.04;
  groundGlow.renderOrder = 18;
  group.add(groundGlow);

  var platform = new THREE.Mesh(
    new THREE.CylinderGeometry(SHAFT_W * 0.5, SHAFT_W * 0.54, 0.14, 36),
    new THREE.MeshStandardMaterial({
      color: 0xe8f4ff,
      emissive: 0xaaccff,
      emissiveIntensity: 2.2,
      metalness: 0.15,
      roughness: 0.3,
      fog: false,
    })
  );
  platform.position.y = 0.09;
  group.add(platform);

  var ring = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.15, 48),
    glowBasic({ color: 0xffffff, opacity: 0.95, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.16;
  group.add(ring);

  var skySpot = new THREE.SpotLight(0xffffff, 5.5, BEAM_H * 0.95, 0.38, 0.28, 1.05);
  skySpot.position.set(0, 0.4, 0);
  skySpot.target.position.set(0, BEAM_H, 0);
  group.add(skySpot);
  group.add(skySpot.target);

  var pl = new THREE.PointLight(0xf0f8ff, 4.2, 28, 1.35);
  pl.position.set(0, 2.8, 0);
  group.add(pl);
  var plMid = new THREE.PointLight(0xd8ecff, 2.8, 45, 1.15);
  plMid.position.set(0, 14, 0);
  group.add(plMid);
  var plUp = new THREE.PointLight(0xffffff, 2.2, 55, 1.05);
  plUp.position.set(0, 32, 0);
  group.add(plUp);

  var pick = new THREE.Mesh(
    new THREE.CylinderGeometry(SHAFT_W * 0.52, SHAFT_W * 0.52, 0.25, 16),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.y = 0.12;
  group.add(pick);

  parent.add(group);

  return {
    group: group,
    x: center.x,
    z: center.z,
    interactDist: ELEVATOR_INTERACT_DIST,
    beams: beams,
    core: core,
    skyRings: skyRings,
    groundGlow: groundGlow,
    ring: ring,
    pl: pl,
    plMid: plMid,
    plUp: plUp,
    skySpot: skySpot,
  };
}

/** 呼吸式光柱动画 */
export function updateLevel3ElevatorGlow(shaft, now) {
  if (!shaft || !shaft.group) return;
  var t = now * 0.001;
  var pulse = 0.88 + Math.sin(t * 2.4) * 0.1 + Math.sin(t * 6.1) * 0.04;
  var i;
  if (shaft.beams) {
    for (i = 0; i < shaft.beams.length; i++) {
      shaft.beams[i].material.opacity = (0.82 + pulse * 0.18) * (i < 2 ? 1 : 0.72);
    }
  }
  if (shaft.core) shaft.core.material.opacity = 0.48 + pulse * 0.28;
  if (shaft.groundGlow) shaft.groundGlow.material.opacity = 0.82 + pulse * 0.16;
  if (shaft.ring) shaft.ring.material.opacity = 0.82 + pulse * 0.16;
  if (shaft.skyRings) {
    for (i = 0; i < shaft.skyRings.length; i++) {
      var base = 0.22 - i * 0.012;
      shaft.skyRings[i].material.opacity = base + pulse * 0.12 + Math.sin(t * 3 + i * 0.7) * 0.04;
      shaft.skyRings[i].rotation.z = t * 0.15 + i * 0.2;
    }
  }
  if (shaft.pl) shaft.pl.intensity = 3.8 * pulse;
  if (shaft.plMid) shaft.plMid.intensity = 2.6 * pulse;
  if (shaft.plUp) shaft.plUp.intensity = 2.0 * pulse;
  if (shaft.skySpot) shaft.skySpot.intensity = 5.0 * pulse;
}

export function isNearLevel3Elevator(px, pz, shaft) {
  if (!shaft) return false;
  var dx = px - shaft.x;
  var dz = pz - shaft.z;
  return dx * dx + dz * dz <= shaft.interactDist * shaft.interactDist;
}
