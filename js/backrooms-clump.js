/**
 * 肢团（Clump）— 肢体融合成的多足实体，程序化建模
 */
import * as THREE from "three";

export const CLUMP_DEFAULT_SCALE = 1;
/** 蹲伏态宽约 1.1m */
export const CLUMP_BASE_WIDTH = 1.1;

var _limbUpperGeo = null;
var _limbLowerGeo = null;
var _jointGeo = null;
var _footGeo = null;
var _coreGeo = null;

function limbUpperGeo() {
  if (!_limbUpperGeo) _limbUpperGeo = new THREE.CapsuleGeometry(0.075, 0.28, 5, 8);
  return _limbUpperGeo;
}

function limbLowerGeo() {
  if (!_limbLowerGeo) _limbLowerGeo = new THREE.CapsuleGeometry(0.065, 0.26, 5, 8);
  return _limbLowerGeo;
}

function jointGeo() {
  if (!_jointGeo) _jointGeo = new THREE.SphereGeometry(0.09, 8, 8);
  return _jointGeo;
}

function footGeo() {
  if (!_footGeo) _footGeo = new THREE.BoxGeometry(0.11, 0.06, 0.2);
  return _footGeo;
}

function coreGeo() {
  if (!_coreGeo) _coreGeo = new THREE.IcosahedronGeometry(1, 1);
  return _coreGeo;
}

function fleshMaterial(seed) {
  var hue = 0.06 + (seed % 7) * 0.008;
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.28, 0.52),
    roughness: 0.94,
    metalness: 0.02,
  });
}

/**
 * 固定肢体布局 — 四足支撑 + 多臂外伸，贴近 Wiki 肢团造型
 * rotY/rotZ: 从核心向外伸展方向（弧度）
 */
var CLUMP_LIMBS = [
  { kind: "leg", rotY: 0.55, rotZ: 1.05, reach: 0.38, upper: 0.32, lower: 0.3, foot: true },
  { kind: "leg", rotY: 2.2, rotZ: 1.12, reach: 0.36, upper: 0.3, lower: 0.28, foot: true },
  { kind: "leg", rotY: -0.45, rotZ: 1.08, reach: 0.34, upper: 0.31, lower: 0.29, foot: true },
  { kind: "leg", rotY: -2.35, rotZ: 1.15, reach: 0.35, upper: 0.29, lower: 0.27, foot: true },
  { kind: "leg", rotY: 1.05, rotZ: 0.95, reach: 0.3, upper: 0.26, lower: 0.24, foot: true },
  { kind: "arm", rotY: 0.15, rotZ: -0.55, reach: 0.42, upper: 0.34, lower: 0.3, foot: false },
  { kind: "arm", rotY: 2.85, rotZ: -0.48, reach: 0.4, upper: 0.33, lower: 0.28, foot: false },
  { kind: "arm", rotY: -1.0, rotZ: -0.72, reach: 0.36, upper: 0.3, lower: 0.26, foot: false },
  { kind: "arm", rotY: 1.65, rotZ: -0.65, reach: 0.38, upper: 0.32, lower: 0.27, foot: false },
];

var CLUMP_CORE_BLOBS = [
  { x: 0, y: 0.38, z: 0, sx: 0.42, sy: 0.36, sz: 0.4 },
  { x: 0.08, y: 0.44, z: -0.06, sx: 0.28, sy: 0.26, sz: 0.3 },
  { x: -0.1, y: 0.35, z: 0.07, sx: 0.24, sy: 0.22, sz: 0.26 },
  { x: 0.04, y: 0.28, z: 0.1, sx: 0.22, sy: 0.2, sz: 0.24 },
  { x: -0.05, y: 0.48, z: 0.04, sx: 0.18, sy: 0.16, sz: 0.18 },
];

function buildLimbChain(spec, mat, matDark, animIdx) {
  var root = new THREE.Group();
  root.name = spec.kind === "leg" ? "ClumpLeg" : "ClumpArm";

  var anchor = new THREE.Mesh(jointGeo(), matDark);
  anchor.scale.setScalar(0.85 + (animIdx % 3) * 0.06);
  root.add(anchor);

  var upperPivot = new THREE.Group();
  upperPivot.rotation.order = "YXZ";
  upperPivot.rotation.y = spec.rotY;
  upperPivot.rotation.z = spec.rotZ;
  root.add(upperPivot);

  var upper = new THREE.Mesh(limbUpperGeo(), mat);
  upper.position.y = -0.18;
  upperPivot.add(upper);

  var knee = new THREE.Group();
  knee.position.y = -0.36;
  knee.rotation.x = spec.kind === "leg" ? 0.65 : 0.45;
  upperPivot.add(knee);

  var lower = new THREE.Mesh(limbLowerGeo(), mat);
  lower.position.y = -0.16;
  knee.add(lower);

  var end = new THREE.Group();
  end.position.y = -0.32;
  end.rotation.x = spec.kind === "leg" ? -0.35 : -0.2;
  knee.add(end);

  if (spec.foot) {
    var foot = new THREE.Mesh(footGeo(), matDark);
    foot.position.set(0, -0.04, 0.06);
    foot.rotation.x = 0.15;
    end.add(foot);
  } else {
    var hand = new THREE.Mesh(jointGeo(), mat);
    hand.scale.set(0.75, 0.55, 0.65);
    hand.position.y = -0.06;
    end.add(hand);
  }

  root.position.set(
    Math.sin(spec.rotY) * spec.reach * 0.35,
    0.38 + (spec.kind === "leg" ? -0.02 : 0.06),
    Math.cos(spec.rotY) * spec.reach * 0.35
  );

  return {
    root: root,
    upperPivot: upperPivot,
    knee: knee,
    phase: animIdx * 1.7,
    kind: spec.kind,
    baseRotZ: spec.rotZ,
    baseKneeX: spec.kind === "leg" ? 0.65 : 0.45,
    baseY: 0.38 + (spec.kind === "leg" ? -0.02 : 0.06),
  };
}

/**
 * @param {{ scale?: number, seed?: number }} [opts]
 */
export function buildClumpFigure(opts) {
  opts = opts || {};
  var unitScale = opts.scale != null ? opts.scale : CLUMP_DEFAULT_SCALE;
  var seed = opts.seed != null ? opts.seed : 0;

  var group = new THREE.Group();
  group.name = "Clump";

  var coreMat = fleshMaterial(seed);
  var limbMat = fleshMaterial(seed + 3);
  var darkMat = fleshMaterial(seed + 9);
  darkMat.color.multiplyScalar(0.82);

  var core = new THREE.Group();
  core.name = "ClumpCore";
  var i;
  for (i = 0; i < CLUMP_CORE_BLOBS.length; i++) {
    var b = CLUMP_CORE_BLOBS[i];
    var blob = new THREE.Mesh(coreGeo(), i % 2 === 0 ? coreMat : limbMat);
    blob.position.set(b.x, b.y, b.z);
    blob.scale.set(b.sx, b.sy, b.sz);
    blob.rotation.set(
      (i * 0.41) % 0.6,
      (i * 0.73) % 1.2,
      (i * 0.29) % 0.5
    );
    core.add(blob);
  }
  group.add(core);

  var limbs = [];
  for (i = 0; i < CLUMP_LIMBS.length; i++) {
    var chain = buildLimbChain(CLUMP_LIMBS[i], limbMat, darkMat, i);
    group.add(chain.root);
    limbs.push(chain);
  }

  group.scale.setScalar(unitScale);

  function update(t) {
    var j;
    for (j = 0; j < limbs.length; j++) {
      var L = limbs[j];
      var wobble = Math.sin(t * (1.6 + (j % 4) * 0.15) + L.phase);
      L.upperPivot.rotation.z = L.baseRotZ + wobble * 0.04;
      L.knee.rotation.x = L.baseKneeX + wobble * 0.06;
      if (L.kind === "leg") {
        L.root.position.y = L.baseY + Math.sin(t * 2.1 + L.phase) * 0.012;
      }
    }
    core.rotation.y = Math.sin(t * 0.35) * 0.04;
  }

  function dispose() {
    coreMat.dispose();
    limbMat.dispose();
    darkMat.dispose();
  }

  return {
    group: group,
    core: core,
    limbs: limbs,
    scale: unitScale,
    update: update,
    dispose: dispose,
  };
}

/**
 * 放置到场景
 * @param {THREE.Object3D} parent
 * @param {{ x: number, z: number, rotY?: number, scale?: number }} spec
 */
export function spawnClump(parent, spec) {
  spec = spec || {};
  var fig = buildClumpFigure({ scale: spec.scale });
  fig.group.position.set(spec.x || 0, 0, spec.z || 0);
  if (spec.rotY != null) fig.group.rotation.y = spec.rotY;
  parent.add(fig.group);
  return fig;
}
