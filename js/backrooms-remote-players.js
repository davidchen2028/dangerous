/**
 * 远端玩家胶囊人 + 快照插值。
 */
import * as THREE from "three";

const BUFFER_MS = 100;
const NAME_HEIGHT = 2.15;

function makeLabelTexture(text) {
  if (typeof document === "undefined") return null;
  var canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  var ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f2f6fa";
  ctx.font = "28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text || "流浪者").slice(0, 16), 128, 32);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAvatar(nickname, downed) {
  var group = new THREE.Group();
  group.name = "RemoteWanderer";
  var body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 1.5, 8),
    new THREE.MeshLambertMaterial({
      color: downed ? 0x6a3030 : 0x4a6a82,
    })
  );
  body.position.y = 0.75;
  group.add(body);
  var map = makeLabelTexture(nickname);
  var spriteMat = { color: 0xffffff, depthTest: false };
  if (map) spriteMat.map = map;
  var label = new THREE.Sprite(new THREE.SpriteMaterial(spriteMat));
  label.position.y = NAME_HEIGHT;
  label.scale.set(1.4, 0.35, 1);
  group.add(label);
  group.userData.brRemoteBody = body;
  return group;
}

function disposeAvatar(group) {
  if (!group) return;
  var geometries = new Set();
  var materials = new Set();
  var textures = new Set();
  group.traverse(function (object) {
    if (object.geometry) geometries.add(object.geometry);
    var list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (var i = 0; i < list.length; i++) {
      var material = list[i];
      materials.add(material);
      if (material.map) textures.add(material.map);
    }
  });
  textures.forEach(function (texture) {
    texture.dispose();
  });
  materials.forEach(function (material) {
    material.dispose();
  });
  geometries.forEach(function (geometry) {
    geometry.dispose();
  });
}

let sceneHookInstalled = false;
let detectedScene = null;
const sceneWatchers = [];

/**
 * 各关卡页面并不统一暴露 scene，camera 也基本没有 parent，
 * 而 WebGLRenderer.render 是实例属性、挂原型无效。
 * 这里改挂 Object3D.prototype.add，从任意一次入场景的挂载往上找根，任何关卡都能拿到。
 */
export function watchRenderedScene(fn) {
  if (typeof fn !== "function") return;
  sceneWatchers.push(fn);
  if (detectedScene) fn(detectedScene);
  if (sceneHookInstalled || !THREE.Object3D) return;
  sceneHookInstalled = true;
  const proto = THREE.Object3D.prototype;
  const originalAdd = proto.add;
  proto.add = function () {
    const result = originalAdd.apply(this, arguments);
    let node = this;
    while (node.parent) node = node.parent;
    if (node.isScene && node !== detectedScene) {
      detectedScene = node;
      for (let i = 0; i < sceneWatchers.length; i++) sceneWatchers[i](node);
    }
    return result;
  };
}

export function createRemotePlayerPool() {
  var byId = Object.create(null);
  var scene = null;

  function setScene(next) {
    if (scene === next) return;
    dispose();
    scene = next || null;
  }

  function applyPeer(peer, t) {
    if (!scene || !peer || peer.userId == null) return;
    var id = String(peer.userId);
    var rec = byId[id];
    if (!rec) {
      rec = {
        mesh: buildAvatar(peer.nickname, peer.downed),
        from: { x: peer.x, z: peer.z, y: peer.y || 0, yaw: peer.yaw || 0 },
        to: { x: peer.x, z: peer.z, y: peer.y || 0, yaw: peer.yaw || 0 },
        fromT: t,
        toT: t,
        peer: peer,
      };
      // 新玩家直接落到当前坐标，否则第一帧会从世界原点滑过来。
      rec.mesh.position.set(peer.x, peer.y || 0, peer.z);
      rec.mesh.rotation.y = peer.yaw || 0;
      scene.add(rec.mesh);
      byId[id] = rec;
    }
    rec.from.x = rec.mesh.position.x;
    rec.from.z = rec.mesh.position.z;
    rec.from.y = rec.mesh.position.y;
    rec.from.yaw = rec.mesh.rotation.y;
    rec.fromT = t;
    rec.to.x = peer.x;
    rec.to.z = peer.z;
    rec.to.y = peer.y || 0;
    rec.to.yaw = peer.yaw || 0;
    rec.toT = t + BUFFER_MS;
    rec.peer = peer;
    var body = rec.mesh.userData.brRemoteBody;
    if (body && body.material) {
      body.material.color.setHex(peer.downed ? 0x6a3030 : 0x4a6a82);
      rec.mesh.rotation.x = peer.downed ? Math.PI * 0.5 : 0;
    }
  }

  function syncPeers(peers, t) {
    var seen = Object.create(null);
    var i;
    peers = peers || [];
    for (i = 0; i < peers.length; i++) {
      seen[String(peers[i].userId)] = true;
      applyPeer(peers[i], t);
    }
    var id;
    for (id in byId) {
      if (!seen[id]) {
        if (byId[id].mesh.parent) byId[id].mesh.parent.remove(byId[id].mesh);
        disposeAvatar(byId[id].mesh);
        delete byId[id];
      }
    }
  }

  function update(now) {
    var id;
    for (id in byId) {
      var rec = byId[id];
      var span = rec.toT - rec.fromT || 1;
      var u = Math.max(0, Math.min(1, (now - rec.fromT) / span));
      rec.mesh.position.x = rec.from.x + (rec.to.x - rec.from.x) * u;
      rec.mesh.position.z = rec.from.z + (rec.to.z - rec.from.z) * u;
      rec.mesh.position.y = rec.from.y + (rec.to.y - rec.from.y) * u;
      rec.mesh.rotation.y = rec.from.yaw + (rec.to.yaw - rec.from.yaw) * u;
    }
  }

  function pickReviveTarget(origin, yaw, maxDist) {
    var best = null;
    var bestScore = maxDist;
    var id;
    var fx = -Math.sin(yaw);
    var fz = -Math.cos(yaw);
    for (id in byId) {
      var rec = byId[id];
      if (!rec.peer || !rec.peer.downed) continue;
      var dx = rec.mesh.position.x - origin.x;
      var dz = rec.mesh.position.z - origin.z;
      var dist = Math.hypot(dx, dz);
      if (dist > maxDist) continue;
      var dir = dist > 0.001 ? (dx * fx + dz * fz) / dist : 1;
      if (dir < 0.35) continue;
      if (dist < bestScore) {
        bestScore = dist;
        best = rec.peer;
      }
    }
    return best;
  }

  function dispose() {
    var id;
    for (id in byId) {
      if (byId[id].mesh.parent) byId[id].mesh.parent.remove(byId[id].mesh);
      disposeAvatar(byId[id].mesh);
    }
    byId = Object.create(null);
  }

  return {
    setScene: setScene,
    syncPeers: syncPeers,
    update: update,
    pickReviveTarget: pickReviveTarget,
    dispose: dispose,
  };
}
