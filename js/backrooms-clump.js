/**
 * 肢团（Clump）— 肢体融合成的多足实体
 * 支持 GLB 分部件装配（血肉核心、上肢、下肢、假肢义足、粉色网纱手套）
 * 并保留程序化占位以实现即时渲染与平滑无缝装配。
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

export const CLUMP_DEFAULT_SCALE = 1;
/** 蹲伏态宽约 1.1m */
export const CLUMP_BASE_WIDTH = 1.1;

export const CLUMP_PART_URL = {
  core: "models/clump-core.glb",
  limbUpper: "models/clump-limb-upper.glb",
  limbLower: "models/clump-limb-lower.glb",
  foot: "models/clump-foot.glb",
  hand: "models/clump-hand.glb",
};

var partTemplates = null;
var partLoadStarted = false;
/** @type {((parts: object) => void)[]} */
var partWaiters = [];

function loadPart(loader, url) {
  return new Promise(function (resolve) {
    loader.load(
      url,
      function (gltf) {
        var scene = gltf.scene || (gltf.scenes && gltf.scenes[0]);
        if (scene) {
          scene.traverse(function (child) {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
        }
        resolve(scene || null);
      },
      undefined,
      function () {
        resolve(null);
      }
    );
  });
}

export function whenClumpParts(callback) {
  if (typeof window === "undefined") {
    // Node.js 或单元测试环境下跳过 GLTF 异步网络拉取，保留纯程序化网格
    return;
  }
  if (partTemplates) {
    callback(partTemplates);
    return;
  }
  partWaiters.push(callback);
  if (partLoadStarted) return;
  partLoadStarted = true;

  var loader = new GLTFLoader();
  Promise.all([
    loadPart(loader, CLUMP_PART_URL.core),
    loadPart(loader, CLUMP_PART_URL.limbUpper),
    loadPart(loader, CLUMP_PART_URL.limbLower),
    loadPart(loader, CLUMP_PART_URL.foot),
    loadPart(loader, CLUMP_PART_URL.hand),
  ]).then(function (scenes) {
    partTemplates = {
      core: scenes[0],
      limbUpper: scenes[1],
      limbLower: scenes[2],
      foot: scenes[3],
      hand: scenes[4],
    };
    var pending = partWaiters.slice();
    partWaiters.length = 0;
    for (var i = 0; i < pending.length; i++) {
      try {
        pending[i](partTemplates);
      } catch (e) {
        console.error("Clump part callback error:", e);
      }
    }
  });
}

export function getClumpPartTemplates() {
  return partTemplates;
}

/* ================= 程序化几何体 fallback ================= */

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
 * 固定肢体布局 — 5 腿支撑 + 4 臂外伸，贴近 Wiki 肢团造型
 */
export var CLUMP_LIMBS = [
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

/* ================= 模型拟合与装配助手函数 ================= */

/**
 * 将肢体段落模型根据目标长度拟合（沿 -Y 方向从 0 延伸至 -targetLength）
 */
function fitLimbSegment(template, targetLength, options) {
  options = options || {};
  var wrapper = new THREE.Group();
  var clone = template.clone(true);
  clone.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  var box = new THREE.Box3().setFromObject(clone);
  var size = new THREE.Vector3();
  box.getSize(size);
  var rawLen = Math.max(0.001, size.y);
  var scale = targetLength / rawLen;
  clone.scale.setScalar(scale);

  if (options.flipY) {
    clone.rotation.z = Math.PI;
  }
  if (options.rotY) clone.rotation.y = options.rotY;

  clone.updateMatrixWorld(true);
  var sBox = new THREE.Box3().setFromObject(clone);
  // 水平居中
  clone.position.x -= (sBox.min.x + sBox.max.x) * 0.5;
  clone.position.z -= (sBox.min.z + sBox.max.z) * 0.5;
  // 顶部与 0 对齐，沿 -Y 方向延伸
  clone.position.y -= sBox.max.y;

  wrapper.add(clone);
  return wrapper;
}

/**
 * 假肢义足（Foot）拟合装配：套筒在顶部 (0,0,0)，脚掌在底部向 +Z 方向延伸
 */
function fitFoot(template, targetHeight) {
  var wrapper = new THREE.Group();
  var clone = template.clone(true);
  clone.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  var box = new THREE.Box3().setFromObject(clone);
  var rawH = Math.max(0.001, box.max.y - box.min.y);
  var scale = targetHeight / rawH;
  clone.scale.setScalar(scale);
  clone.updateMatrixWorld(true);

  var sBox = new THREE.Box3().setFromObject(clone);
  // 水平居中
  clone.position.x -= (sBox.min.x + sBox.max.x) * 0.5;
  clone.position.z -= (sBox.min.z + sBox.max.z) * 0.5;
  // 套筒在 0 处，脚板在 -targetHeight
  clone.position.y -= sBox.max.y;
  // 微调脚部姿态，脚尖向前略微下倾
  wrapper.rotation.x = 0.2;
  wrapper.position.set(0, -0.02, 0.04);
  wrapper.add(clone);
  return wrapper;
}

/**
 * 手套/手臂末端（Hand）拟合装配：手腕在 (0,0,0)，手指沿负 Y 向前/向地抓爬
 */
function fitHand(template, targetHeight) {
  var wrapper = new THREE.Group();
  var clone = template.clone(true);
  clone.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  var box = new THREE.Box3().setFromObject(clone);
  var rawH = Math.max(0.001, box.max.y - box.min.y);
  var scale = targetHeight / rawH;
  clone.scale.setScalar(scale);
  // 手腕朝内，手指朝外下倾
  clone.rotation.x = Math.PI * 0.85;
  clone.rotation.y = Math.PI * 0.25;
  clone.updateMatrixWorld(true);

  var sBox = new THREE.Box3().setFromObject(clone);
  clone.position.x -= (sBox.min.x + sBox.max.x) * 0.5;
  clone.position.z -= (sBox.min.z + sBox.max.z) * 0.5;
  clone.position.y -= sBox.max.y;

  wrapper.position.set(0, -0.03, 0.02);
  wrapper.add(clone);
  return wrapper;
}

/**
 * 肉核（Core）拟合装配：置于实体核心，略带轻微有机扭动
 */
function fitCore(template, targetHeight) {
  var clone = template.clone(true);
  clone.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  var box = new THREE.Box3().setFromObject(clone);
  var rawH = Math.max(0.001, box.max.y - box.min.y);
  var scale = targetHeight / rawH;
  clone.scale.setScalar(scale);
  clone.updateMatrixWorld(true);

  var sBox = new THREE.Box3().setFromObject(clone);
  clone.position.x = -(sBox.min.x + sBox.max.x) * 0.5;
  clone.position.z = -(sBox.min.z + sBox.max.z) * 0.5;
  // 核心离地适度居中在 y=0.38 附近
  clone.position.y = 0.38 - (sBox.min.y + sBox.max.y) * 0.5;

  return clone;
}

/* ================= 肢体构建与骨骼层级 ================= */

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

  // 程序化几何上肢
  var upperPlaceholder = new THREE.Mesh(limbUpperGeo(), mat);
  upperPlaceholder.position.y = -spec.upper * 0.5;
  upperPivot.add(upperPlaceholder);

  var knee = new THREE.Group();
  knee.position.y = -spec.upper;
  knee.rotation.x = spec.kind === "leg" ? 0.65 : 0.45;
  upperPivot.add(knee);

  // 程序化几何下肢
  var lowerPlaceholder = new THREE.Mesh(limbLowerGeo(), mat);
  lowerPlaceholder.position.y = -spec.lower * 0.5;
  knee.add(lowerPlaceholder);

  var end = new THREE.Group();
  end.position.y = -spec.lower;
  end.rotation.x = spec.kind === "leg" ? -0.35 : -0.2;
  knee.add(end);

  var terminalPlaceholder = null;
  if (spec.foot) {
    terminalPlaceholder = new THREE.Mesh(footGeo(), matDark);
    terminalPlaceholder.position.set(0, -0.04, 0.06);
    terminalPlaceholder.rotation.x = 0.15;
    end.add(terminalPlaceholder);
  } else {
    terminalPlaceholder = new THREE.Mesh(jointGeo(), mat);
    terminalPlaceholder.scale.set(0.75, 0.55, 0.65);
    terminalPlaceholder.position.y = -0.06;
    end.add(terminalPlaceholder);
  }

  root.position.set(
    Math.sin(spec.rotY) * spec.reach * 0.35,
    0.38 + (spec.kind === "leg" ? -0.02 : 0.06),
    Math.cos(spec.rotY) * spec.reach * 0.35
  );

  var glbUpper = null;
  var glbLower = null;
  var glbTerminal = null;

  function applyGLB(parts) {
    if (!parts) return;
    // 上肢
    if (parts.limbUpper && !glbUpper) {
      glbUpper = fitLimbSegment(parts.limbUpper, spec.upper, {
        flipY: true,
        rotY: animIdx * 0.7,
      });
      upperPivot.add(glbUpper);
      upperPlaceholder.visible = false;
    }
    // 下肢
    if (parts.limbLower && !glbLower) {
      glbLower = fitLimbSegment(parts.limbLower, spec.lower, {
        flipY: false,
        rotY: animIdx * 0.5,
      });
      knee.add(glbLower);
      lowerPlaceholder.visible = false;
    }
    // 终端：义足或手套
    if (spec.foot && parts.foot && !glbTerminal) {
      glbTerminal = fitFoot(parts.foot, 0.22);
      end.add(glbTerminal);
      if (terminalPlaceholder) terminalPlaceholder.visible = false;
    } else if (!spec.foot && parts.hand && !glbTerminal) {
      glbTerminal = fitHand(parts.hand, 0.22);
      end.add(glbTerminal);
      if (terminalPlaceholder) terminalPlaceholder.visible = false;
    }
  }

  return {
    root: root,
    upperPivot: upperPivot,
    knee: knee,
    end: end,
    phase: animIdx * 1.7,
    kind: spec.kind,
    baseRotZ: spec.rotZ,
    baseKneeX: spec.kind === "leg" ? 0.65 : 0.45,
    baseY: 0.38 + (spec.kind === "leg" ? -0.02 : 0.06),
    applyGLB: applyGLB,
  };
}

/**
 * 构建肢团实体模型
 * @param {{ scale?: number, seed?: number, useGLB?: boolean }} [opts]
 */
export function buildClumpFigure(opts) {
  opts = opts || {};
  var unitScale = opts.scale != null ? opts.scale : CLUMP_DEFAULT_SCALE;
  var seed = opts.seed != null ? opts.seed : 0;
  var useGLB = opts.useGLB !== false;

  var group = new THREE.Group();
  group.name = "Clump";

  var coreMat = fleshMaterial(seed);
  var limbMat = fleshMaterial(seed + 3);
  var darkMat = fleshMaterial(seed + 9);
  darkMat.color.multiplyScalar(0.82);

  var core = new THREE.Group();
  core.name = "ClumpCore";

  // 程序化几何核心肉块
  var placeholderCoreBlobs = [];
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
    placeholderCoreBlobs.push(blob);
  }
  group.add(core);

  var limbs = [];
  for (i = 0; i < CLUMP_LIMBS.length; i++) {
    var chain = buildLimbChain(CLUMP_LIMBS[i], limbMat, darkMat, i);
    group.add(chain.root);
    limbs.push(chain);
  }

  group.scale.setScalar(unitScale);

  var glbCoreMesh = null;
  var glbCoreBaseScale = new THREE.Vector3(1, 1, 1);
  var isGLBLoaded = false;

  function onPartsReady(parts) {
    if (!parts || !useGLB) return;
    if (parts.core && !glbCoreMesh) {
      glbCoreMesh = fitCore(parts.core, 0.58);
      glbCoreBaseScale.copy(glbCoreMesh.scale);
      core.add(glbCoreMesh);
      // 隐藏程序化肉块
      for (var k = 0; k < placeholderCoreBlobs.length; k++) {
        placeholderCoreBlobs[k].visible = false;
      }
    }
    for (var m = 0; m < limbs.length; m++) {
      limbs[m].applyGLB(parts);
    }
    isGLBLoaded = true;
  }

  if (useGLB) {
    whenClumpParts(onPartsReady);
  }

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
    // 核心有机起伏
    core.rotation.y = Math.sin(t * 0.35) * 0.04;
    core.position.y = Math.sin(t * 1.5) * 0.008;
    if (glbCoreMesh) {
      var breathe = 1 + Math.sin(t * 2.2) * 0.025;
      glbCoreMesh.scale.copy(glbCoreBaseScale).multiplyScalar(breathe);
    }
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
    isLoaded: function () {
      return isGLBLoaded;
    },
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
