/**
 * 杏仁水瓶模型：马尼拉书桌上的瓶子与地上丢下的瓶子共用一份模板。
 */
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const ALMOND_BOTTLE_GLB_URL = "models/level0-almond-bottle.glb";
/** 模型包围盒：高 Y=1，直径约 0.35，底在 y=0，绿盖朝 +Y。 */
export const ALMOND_BOTTLE_SOURCE_HEIGHT = 1;
export const ALMOND_BOTTLE_HEIGHT = 0.36;

var template = null;
var loadStarted = false;
var waiters = [];

function flush(value) {
  var list = waiters.splice(0);
  for (var i = 0; i < list.length; i++) list[i](value);
}

/** @param {(mesh: import("three").Mesh | null) => void} onReady */
export function requestAlmondBottleModel(onReady) {
  if (template) {
    onReady(template);
    return;
  }
  waiters.push(onReady);
  if (loadStarted) return;
  loadStarted = true;
  new GLTFLoader().load(
    ALMOND_BOTTLE_GLB_URL,
    function (gltf) {
      var mesh = null;
      gltf.scene.traverse(function (child) {
        if (!mesh && child.isMesh) mesh = child;
      });
      template = mesh || null;
      flush(template);
    },
    undefined,
    function (err) {
      console.warn("[Backrooms] 杏仁水瓶模型加载失败，保留圆柱瓶", err);
      flush(null);
    }
  );
}
