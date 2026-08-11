/**
 * 后室飞蛾 — 程序化建模（普通飞蛾 / 死亡飞蛾 2×）
 */
import * as THREE from "three";

export const MOTH_NORMAL_SCALE = 1;
export const MOTH_DEATH_SCALE = 2;

/** 普通飞蛾基准尺寸（米） */
export const MOTH_BASE_WINGSPAN = 0.42;
export const MOTH_BASE_BODY_LEN = 0.14;

function createWingTexture(variant) {
  var isDeath = variant === "death";
  var w = 256;
  var h = 192;
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;

  var base = isDeath ? "#1a1410" : "#8a7a62";
  var vein = isDeath ? "#3d2818" : "#5c4a32";
  var dust = isDeath ? "rgba(120,40,20,0.35)" : "rgba(210,190,150,0.45)";
  var edge = isDeath ? "#0a0604" : "#4a3c28";

  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.moveTo(w * 0.04, h * 0.52);
  ctx.quadraticCurveTo(w * 0.22, h * 0.08, w * 0.96, h * 0.38);
  ctx.quadraticCurveTo(w * 0.72, h * 0.72, w * 0.08, h * 0.88);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = vein;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.55);
  ctx.lineTo(w * 0.92, h * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.58);
  ctx.quadraticCurveTo(w * 0.55, h * 0.22, w * 0.88, h * 0.52);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.62);
  ctx.quadraticCurveTo(w * 0.48, h * 0.78, w * 0.82, h * 0.68);
  ctx.stroke();

  var i;
  for (i = 0; i < (isDeath ? 180 : 120); i++) {
    ctx.fillStyle = dust;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }

  ctx.strokeStyle = edge;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.04, h * 0.52);
  ctx.quadraticCurveTo(w * 0.22, h * 0.08, w * 0.96, h * 0.38);
  ctx.quadraticCurveTo(w * 0.72, h * 0.72, w * 0.08, h * 0.88);
  ctx.closePath();
  ctx.stroke();

  if (isDeath) {
    ctx.fillStyle = "rgba(180,30,10,0.18)";
    ctx.beginPath();
    ctx.ellipse(w * 0.62, h * 0.48, w * 0.18, h * 0.22, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addAntenna(group, side, variant) {
  var isDeath = variant === "death";
  var mat = new THREE.MeshStandardMaterial({
    color: isDeath ? 0x2a1810 : 0x4a3828,
    roughness: 0.85,
  });
  var geo = new THREE.CylinderGeometry(0.003, 0.0015, 0.055, 5);
  var ant = new THREE.Mesh(geo, mat);
  ant.position.set(side * 0.018, 0.038, 0.028);
  ant.rotation.z = side * 0.55;
  ant.rotation.x = -0.35;
  group.add(ant);
  var tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.004, 6, 6),
    mat
  );
  tip.position.set(side * 0.032, 0.058, 0.04);
  group.add(tip);
}

/**
 * @param {"normal" | "death"} variant
 * @param {{ scale?: number }} [opts]
 * @returns {{ group: THREE.Group, wings: THREE.Mesh[], variant: string, scale: number, update: (t: number) => void, dispose: () => void }}
 */
export function buildMothFigure(variant, opts) {
  opts = opts || {};
  var isDeath = variant === "death";
  var unitScale =
    opts.scale != null
      ? opts.scale
      : isDeath
        ? MOTH_DEATH_SCALE
        : MOTH_NORMAL_SCALE;

  var group = new THREE.Group();
  group.name = isDeath ? "DeathMoth" : "NormalMoth";

  var bodyMat = new THREE.MeshStandardMaterial({
    color: isDeath ? 0x1a120c : 0x6a5848,
    emissive: isDeath ? 0x120804 : 0x000000,
    emissiveIntensity: isDeath ? 0.35 : 0,
    roughness: 0.92,
  });
  var furMat = new THREE.MeshStandardMaterial({
    color: isDeath ? 0x2a1c14 : 0x9a8878,
    roughness: 0.96,
  });

  var body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.022, 0.09, 4, 8),
    bodyMat
  );
  body.rotation.x = Math.PI * 0.5;
  body.position.set(0, 0.028, 0);
  group.add(body);

  var thorax = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), furMat);
  thorax.position.set(0, 0.032, 0.01);
  thorax.scale.set(1.1, 0.85, 1.25);
  group.add(thorax);

  var head = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), furMat);
  head.position.set(0, 0.036, 0.048);
  group.add(head);

  var eyeMat = new THREE.MeshStandardMaterial({
    color: isDeath ? 0xaa2208 : 0x1a1408,
    emissive: isDeath ? 0x661008 : 0x000000,
    emissiveIntensity: isDeath ? 0.85 : 0,
    roughness: 0.35,
  });
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), eyeMat);
  eyeL.position.set(-0.009, 0.038, 0.056);
  group.add(eyeL);
  var eyeR = eyeL.clone();
  eyeR.position.x = 0.009;
  group.add(eyeR);

  addAntenna(group, -1, variant);
  addAntenna(group, 1, variant);

  var wingTex = createWingTexture(variant);
  var wingMat = new THREE.MeshStandardMaterial({
    map: wingTex || undefined,
    color: wingTex ? 0xffffff : isDeath ? 0x2a1810 : 0x8a7860,
    transparent: true,
    opacity: isDeath ? 0.92 : 0.88,
    side: THREE.DoubleSide,
    roughness: 0.78,
    metalness: 0.02,
    depthWrite: false,
  });

  var halfSpan = MOTH_BASE_WINGSPAN * 0.5;
  var wingGeo = new THREE.PlaneGeometry(halfSpan, halfSpan * 0.72);
  var wingPivotL = new THREE.Group();
  wingPivotL.position.set(0, 0.034, 0.008);
  var wingL = new THREE.Mesh(wingGeo, wingMat);
  wingL.position.set(-halfSpan * 0.48, 0, 0.012);
  wingL.rotation.y = 0.12;
  wingPivotL.add(wingL);
  group.add(wingPivotL);

  var wingPivotR = new THREE.Group();
  wingPivotR.position.set(0, 0.034, 0.008);
  var wingR = new THREE.Mesh(wingGeo, wingMat);
  wingR.position.set(halfSpan * 0.48, 0, 0.012);
  wingR.rotation.y = -0.12;
  wingR.scale.x = -1;
  wingPivotR.add(wingR);
  group.add(wingPivotR);

  var hindGeo = new THREE.PlaneGeometry(halfSpan * 0.62, halfSpan * 0.48);
  var hindMat = wingMat.clone();
  hindMat.opacity = isDeath ? 0.78 : 0.72;
  var hindPivotL = new THREE.Group();
  hindPivotL.position.set(0, 0.028, -0.018);
  var hindL = new THREE.Mesh(hindGeo, hindMat);
  hindL.position.set(-halfSpan * 0.34, 0, 0);
  hindPivotL.add(hindL);
  group.add(hindPivotL);

  var hindPivotR = new THREE.Group();
  hindPivotR.position.set(0, 0.028, -0.018);
  var hindR = new THREE.Mesh(hindGeo, hindMat);
  hindR.position.set(halfSpan * 0.34, 0, 0);
  hindR.scale.x = -1;
  hindPivotR.add(hindR);
  group.add(hindPivotR);

  group.scale.setScalar(unitScale);

  var wingPairs = [wingPivotL, wingPivotR, hindPivotL, hindPivotR];

  function update(t) {
    var flap = Math.sin(t * (isDeath ? 9 : 12)) * 0.22;
    var flutter = Math.sin(t * 23) * 0.04;
    wingPivotL.rotation.z = 0.35 + flap + flutter;
    wingPivotR.rotation.z = -0.35 - flap - flutter;
    hindPivotL.rotation.z = 0.18 + flap * 0.55;
    hindPivotR.rotation.z = -0.18 - flap * 0.55;
    if (isDeath) {
      group.position.y = Math.sin(t * 4.5) * 0.012 * unitScale;
    }
  }

  function dispose() {
    if (wingTex) wingTex.dispose();
    wingGeo.dispose();
    hindGeo.dispose();
    wingMat.dispose();
    hindMat.dispose();
    bodyMat.dispose();
    furMat.dispose();
    eyeMat.dispose();
  }

  return {
    group: group,
    wings: [wingL, wingR, hindL, hindR],
    variant: variant,
    scale: unitScale,
    wingspan: MOTH_BASE_WINGSPAN * unitScale,
    update: update,
    dispose: dispose,
  };
}

/** 死亡飞蛾 = 普通飞蛾 2 倍 */
export function buildDeathMothFigure(opts) {
  return buildMothFigure("death", opts);
}

export function buildNormalMothFigure(opts) {
  return buildMothFigure("normal", opts);
}
