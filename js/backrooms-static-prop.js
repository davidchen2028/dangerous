/**
 * 静态整模。加载后换成 Lambert，只留底色，避免金属贴图在没有环境光时发黑。
 * 模板不缩放；每个实例 clone 后再按目标尺寸贴地。
 */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

export var LEVEL1_PROP = Object.freeze({
  officeDesk: "models/level1-office-desk.glb",
  exploreDesk: "models/level1-explore-desk.glb",
  officeWindow: "models/level1-office-window.glb",
  metalDoor: "models/level1-metal-door.glb",
  industrialGate: "models/level1-industrial-gate.glb",
  doubleDoor: "models/level1-double-door.glb",
  sealedWall: "models/level1-sealed-wall.glb",
  cellarStairs: "models/level1-cellar-stairs.glb",
  fileCabinet: "models/level1-file-cabinet.glb",
  medicalCabinet: "models/level1-medical-cabinet.glb",
  bedsideCabinet: "models/level1-bedside-cabinet.glb",
  locker: "models/level1-locker.glb",
  hospitalBed: "models/level1-hospital-bed.glb",
});

/** @type {Record<string, THREE.Object3D | null>} */
var cache = Object.create(null);
/** @type {Record<string, ((scene: THREE.Object3D | null) => void)[] | null>} */
var pending = Object.create(null);

function useLambertBaseColor(root) {
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    var src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    var map = src && src.map ? src.map : null;
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    obj.material = new THREE.MeshLambertMaterial({
      map: map,
      color: 0xffffff,
    });
  });
}

export function loadStaticProp(url, onReady) {
  if (Object.prototype.hasOwnProperty.call(cache, url)) {
    onReady(cache[url]);
    return;
  }
  if (!pending[url]) pending[url] = [];
  pending[url].push(onReady);
  if (pending[url].length > 1) return;
  new GLTFLoader().load(
    url,
    function (gltf) {
      var scene = gltf && gltf.scene ? gltf.scene : null;
      if (scene) useLambertBaseColor(scene);
      cache[url] = scene;
      var waiters = pending[url] || [];
      pending[url] = null;
      var i;
      for (i = 0; i < waiters.length; i++) waiters[i](scene);
    },
    undefined,
    function () {
      cache[url] = null;
      var waiters = pending[url] || [];
      pending[url] = null;
      var i;
      for (i = 0; i < waiters.length; i++) waiters[i](null);
    }
  );
}

/**
 * @param {THREE.Object3D} template
 * @param {{ yaw?: number, axis?: string, target: number }} opts
 * axis: "x" | "y" | "z" | "maxHorizontal"，按世界轴向缩放后再把底面落到 y=0、水平居中。
 */
export function cloneFittedProp(template, opts) {
  var clone = template.clone(true);
  if (opts.yaw) clone.rotation.y = opts.yaw;
  clone.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(clone);
  var size = new THREE.Vector3();
  box.getSize(size);
  var current = size.y;
  if (opts.axis === "x") current = size.x;
  else if (opts.axis === "z") current = size.z;
  else if (opts.axis === "maxHorizontal") current = Math.max(size.x, size.z);
  clone.scale.multiplyScalar(opts.target / Math.max(current, 0.0001));
  clone.updateMatrixWorld(true);
  box.setFromObject(clone);
  var center = new THREE.Vector3();
  box.getCenter(center);
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= box.min.y;
  return clone;
}

/**
 * @param {THREE.Object3D} parent
 * @param {string} url
 * @param {{ yaw?: number, axis?: string, target: number, name?: string, offset?: { x?: number, y?: number, z?: number } }} opts
 * @param {(model: THREE.Object3D) => void} [onAdded]
 */
export function attachFittedProp(parent, url, opts, onAdded) {
  loadStaticProp(url, function (template) {
    if (!template) return;
    var model = cloneFittedProp(template, opts);
    if (opts.name) model.name = opts.name;
    if (opts.offset) {
      model.position.x += opts.offset.x || 0;
      model.position.y += opts.offset.y || 0;
      model.position.z += opts.offset.z || 0;
    }
    parent.add(model);
    if (onAdded) onAdded(model);
  });
}

/** 在父级坐标 (x, y, z) 放一个贴地实例。失败时不调用 onAdded，调用方的方块可以留着。 */
export function placeFittedProp(parent, url, x, y, z, opts, onAdded) {
  var anchor = new THREE.Group();
  anchor.position.set(x, y || 0, z);
  parent.add(anchor);
  attachFittedProp(anchor, url, opts, onAdded);
  return anchor;
}
