/**
 * Level 8 岩洞系统 — 第九大道、MEG 歇脚、侧洞出口。
 */
import * as THREE from "three";
import {
  L8_CHICKEN_HOMES,
  L8_MARKERS,
  L8_MEG_CAMP,
  L8_MEG_NOTICE_YAW,
  L8_PIPE,
  L8_PIPE_ROLL_KEY,
  L8_PIPE_YAW,
  L8_PLANK,
  L8_PLANK_ZONE,
  L8_SPAWN,
  L8_SPAWN_YAW,
  L8_VENT,
  L8_VENT_PICK,
  L8_VENT_YAW,
  L8_WALL_H,
  listLevel8WallColliders,
} from "./backrooms-level8-layout.js";

export { L8_WALL_H, L8_SPAWN_YAW };

function rockMat(color) {
  return new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.98,
    metalness: 0.02,
    flatShading: true,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
}

function pipeAppearsThisRun() {
  try {
    var saved = sessionStorage.getItem(L8_PIPE_ROLL_KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
    var appears = Math.random() < 0.3;
    sessionStorage.setItem(L8_PIPE_ROLL_KEY, appears ? "1" : "0");
    return appears;
  } catch (err) {
    return Math.random() < 0.3;
  }
}

function sharedDodecaGeo() {
  if (!_dodecaGeo) _dodecaGeo = new THREE.DodecahedronGeometry(1, 0);
  return _dodecaGeo;
}
var _dodecaGeo = null;
var _coneGeos = Object.create(null);
var _plankBoxGeo = null;

function sharedConeGeo(radiusKey, height) {
  var key = radiusKey + ":" + height.toFixed(2);
  if (!_coneGeos[key]) {
    _coneGeos[key] = new THREE.ConeGeometry(0.45 + radiusKey * 0.13, height, 7);
  }
  return _coneGeos[key];
}

function addBox(root, w, h, d, x, y, z, mat) {
  var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  root.add(mesh);
  return mesh;
}

function addPick(root, interactRoots, w, h, d, x, y, z, kind, extra) {
  var pick = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  pick.position.set(x, y, z);
  pick.userData.brInteract = Object.assign({ kind: kind }, extra || {});
  root.add(pick);
  interactRoots.push(pick);
  return pick;
}

function addRock(parent, x, y, z, sx, sy, sz, mat, seed) {
  var rock = new THREE.Mesh(sharedDodecaGeo(), mat);
  rock.position.set(x, y, z);
  rock.scale.set(sx, sy, sz);
  rock.rotation.set(seed * 0.31, seed * 0.53, seed * 0.17);
  parent.add(rock);
  return rock;
}

function signTexture(title, sub) {
  var canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 288;
  var g = canvas.getContext("2d");
  g.fillStyle = "#1a1814";
  g.fillRect(0, 0, 512, 288);
  g.strokeStyle = "#c9a25a";
  g.lineWidth = 8;
  g.strokeRect(10, 10, 492, 268);
  g.fillStyle = "#d8c49a";
  g.beginPath();
  g.moveTo(256, 36);
  g.lineTo(272, 68);
  g.lineTo(244, 60);
  g.closePath();
  g.fill();
  g.fillStyle = "#f3e2b0";
  g.textAlign = "center";
  g.font = "bold 34px sans-serif";
  g.fillText(title || "第九大道", 256, 140);
  g.font = "22px sans-serif";
  g.fillStyle = "#b8a57a";
  g.fillText(sub || "", 256, 188);
  g.font = "18px sans-serif";
  g.fillStyle = "#8a8070";
  g.fillText("M.E.G. — 为了更好的人类", 256, 236);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function addStalactites(parent, mat) {
  var i;
  for (i = 0; i < 36; i++) {
    var x = -5.2 + ((i * 17) % 11);
    var z = -38 + ((i * 29) % 76);
    if (Math.abs(x) < 1.2 && z < -34) continue;
    var h = 1.1 + ((i * 13) % 28) * 0.08;
    var cone = new THREE.Mesh(sharedConeGeo(i % 5, h), mat);
    cone.position.set(x, L8_WALL_H - h * 0.5 - 0.15, z);
    cone.rotation.z = Math.PI;
    parent.add(cone);
  }
}

function addBoundaryRocks(parent, mat) {
  var specs = [
    [-7.6, 34],
    [7.6, 34],
    [-6.9, 24],
    [6.9, 24],
    [-6.9, 10],
    [6.9, -2],
    [-6.9, -16],
    [6.9, -24],
    [-14.8, 2],
    [-14.8, 16],
    [14.8, 16],
    [10.8, -22],
  ];
  var i;
  for (i = 0; i < specs.length; i++) {
    addRock(parent, specs[i][0], 3.4, specs[i][1], 2.4, 5.2 + (i % 3), 2.2, mat, i + 4);
  }
}

function addMileMarkers(parent, interactRoots) {
  var post = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.88 });
  var i;
  for (i = 0; i < L8_MARKERS.length; i++) {
    var m = L8_MARKERS[i];
    addBox(parent, 0.12, 1.55, 0.12, m.x, 0.78, m.z, post);
    var plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.72),
      new THREE.MeshBasicMaterial({ map: signTexture(m.title, m.sub) })
    );
    plate.position.set(m.x, 1.55, m.z + 0.08);
    plate.material.side = THREE.DoubleSide;
    parent.add(plate);
    addPick(parent, interactRoots, 0.7, 1.8, 0.7, m.x, 1.1, m.z, "l8_mile_marker", {
      title: m.title,
      sub: m.sub,
    });
  }
}

function addMegCamp(parent, interactRoots, mats) {
  addBox(parent, 1.15, 0.55, 0.7, L8_MEG_CAMP.x, 0.3, L8_MEG_CAMP.z - 1.1, mats.crate);
  addBox(parent, 0.85, 0.7, 0.55, L8_MEG_CAMP.x + 0.9, 0.38, L8_MEG_CAMP.z + 0.4, mats.crate);
  addBox(parent, 0.08, 1.15, 0.7, L8_MEG_CAMP.x - 0.55, 1.35, L8_MEG_CAMP.z, mats.crate);
  var notice = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.7),
    new THREE.MeshBasicMaterial({
      map: signTexture("跟着道标走", "第九大道 · 稳定孤岛"),
    })
  );
  notice.position.set(L8_MEG_CAMP.x - 0.48, 1.4, L8_MEG_CAMP.z);
  notice.rotation.y = L8_MEG_NOTICE_YAW;
  notice.material.side = THREE.DoubleSide;
  parent.add(notice);
  addPick(parent, interactRoots, 1.1, 1.7, 1.1, L8_MEG_CAMP.x, 1.0, L8_MEG_CAMP.z, "l8_meg_notice");
  var lamp = new THREE.PointLight(0xc9a36a, 0.7, 10, 2);
  lamp.position.set(L8_MEG_CAMP.x, 2.1, L8_MEG_CAMP.z);
  parent.add(lamp);
}

function addWoodenFallPlank(parent, interactRoots) {
  var group = new THREE.Group();
  group.name = "L8FallPlank";
  group.position.set(L8_PLANK.x, 0, L8_PLANK.z);
  var pit = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 2.4, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: 0x020204, roughness: 1 })
  );
  pit.position.y = 0.08;
  group.add(pit);
  var wood = new THREE.MeshStandardMaterial({
    color: 0x76522e,
    roughness: 0.92,
    emissive: 0x120904,
    emissiveIntensity: 0.12,
  });
  if (!_plankBoxGeo) _plankBoxGeo = new THREE.BoxGeometry(0.85, 0.16, 5.1);
  var i;
  for (i = -2; i <= 2; i++) {
    var plank = new THREE.Mesh(_plankBoxGeo, wood);
    plank.position.set(i * 0.82, 0.24 + Math.abs(i) * 0.015, 0);
    plank.rotation.y = i * 0.012;
    group.add(plank);
  }
  addPick(group, interactRoots, 4.4, 0.8, 5.4, 0, 0.5, 0, "l8_plank");
  parent.add(group);
}

function addSilverPipe(parent, interactRoots) {
  var group = new THREE.Group();
  group.name = "L8SilverPipe";
  group.position.set(L8_PIPE.x, 1.15, L8_PIPE.z);
  group.rotation.y = L8_PIPE_YAW;
  var silver = new THREE.MeshStandardMaterial({
    color: 0xc4ccd4,
    metalness: 0.88,
    roughness: 0.22,
    emissive: 0x17202a,
    emissiveIntensity: 0.18,
  });
  var pipe = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 4.6, 18, 1, true), silver);
  pipe.rotation.x = Math.PI * 0.5;
  group.add(pipe);
  var rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 8, 18), silver);
  rim.position.z = -2.25;
  group.add(rim);
  var darkness = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 18),
    new THREE.MeshBasicMaterial({ color: 0x020407 })
  );
  darkness.position.z = -2.28;
  darkness.rotation.y = Math.PI;
  group.add(darkness);
  addPick(group, interactRoots, 2.5, 2.5, 2.0, 0, 0, -1.8, "l8_silver_pipe");
  parent.add(group);
  var glow = new THREE.PointLight(0xb8d8ff, 0.95, 8, 2);
  glow.position.set(L8_PIPE.x + 1.6, 1.5, L8_PIPE.z);
  parent.add(glow);
}

function addColliderWalls(parent, colliders, mat) {
  var i;
  for (i = 0; i < colliders.length; i++) {
    var c = colliders[i];
    addBox(
      parent,
      c.maxX - c.minX,
      L8_WALL_H,
      c.maxZ - c.minZ,
      (c.minX + c.maxX) * 0.5,
      L8_WALL_H * 0.5,
      (c.minZ + c.maxZ) * 0.5,
      mat
    );
  }
}

function addLevel2Vent(parent, interactRoots) {
  var group = new THREE.Group();
  group.name = "L8Level2Vent";
  group.position.set(L8_VENT.x, L8_VENT.y, L8_VENT.z);
  group.rotation.y = L8_VENT_YAW;
  var frameMat = new THREE.MeshStandardMaterial({
    color: 0x52585e,
    metalness: 0.78,
    roughness: 0.48,
  });
  var darkMat = new THREE.MeshBasicMaterial({ color: 0x020305 });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.95, 0.2), frameMat));
  var opening = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.5, 0.28), darkMat);
  opening.position.z = 0.08;
  opening.userData.brInteract = { kind: "l8_level2_vent" };
  group.add(opening);
  var i;
  for (i = -3; i <= 3; i++) {
    var bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.42, 0.1), frameMat);
    bar.position.set(i * 0.28, 0, 0.2);
    group.add(bar);
  }
  addPick(
    parent,
    interactRoots,
    L8_VENT_PICK.w,
    L8_VENT_PICK.h,
    L8_VENT_PICK.d,
    L8_VENT_PICK.x,
    L8_VENT_PICK.y,
    L8_VENT_PICK.z,
    "l8_level2_vent"
  );
  parent.add(group);
}

function addL9Road(parent, interactRoots, mats) {
  addBox(parent, 7.4, 0.08, 7.2, 0, 0.05, -38.6, mats.asphalt);
  addBox(parent, 6.2, 0.05, 4.4, 0, 0.07, -36.4, mats.gravel);
  addPick(parent, interactRoots, 6.8, 2.2, 5.5, 0, 1.1, -38.4, "l8_l9_road");
}

/** @param {THREE.Group} root */
export function buildLevel8World(root) {
  var colliders = listLevel8WallColliders();
  var interactRoots = [];
  var group = new THREE.Group();
  group.name = "Level8World";
  root.add(group);

  var darkRock = rockMat(0x25272a);
  var midRock = rockMat(0x35383c);
  var floorMat = new THREE.MeshStandardMaterial({
    color: 0x191b1e,
    roughness: 1,
    flatShading: true,
  });
  var wetMat = new THREE.MeshStandardMaterial({
    color: 0x1a242c,
    roughness: 0.35,
    metalness: 0.12,
  });
  var asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.96 });
  var gravel = new THREE.MeshStandardMaterial({ color: 0x4a463c, roughness: 1, flatShading: true });
  var crate = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.86 });

  addBox(group, 16.4, 0.12, 13.2, 0, 0.04, 34, wetMat);
  addBox(group, 12.2, 0.1, 70, 0, 0.03, 0, floorMat);
  addBox(group, 10.4, 0.1, 12.4, -11, 0.03, 2, floorMat);
  addBox(group, 10.4, 0.1, 11, -11, 0.03, 17, floorMat);
  addBox(group, 10.4, 0.1, 12.2, 11, 0.03, 16, floorMat);
  addBox(group, 6.4, 0.1, 8.2, 9, 0.03, -22, floorMat);
  addBox(group, 33, 0.1, 86, 0, L8_WALL_H, 0, darkRock);
  addColliderWalls(group, colliders, darkRock);

  addBoundaryRocks(group, darkRock);
  addStalactites(group, midRock);

  var i;
  for (i = 0; i < 16; i++) {
    var x = -4.4 + ((i * 19) % 9);
    var z = -30 + ((i * 23) % 58);
    if (Math.abs(x) < 1.6 && z > 28) continue;
    if (Math.abs(x) < 2 && z < -34) continue;
    addRock(group, x, 0.42, z, 0.45 + (i % 3) * 0.22, 0.38 + (i % 4) * 0.16, 0.5, midRock, i + 80);
  }

  addMileMarkers(group, interactRoots);
  addMegCamp(group, interactRoots, { crate: crate });
  addWoodenFallPlank(group, interactRoots);
  addLevel2Vent(group, interactRoots);
  addL9Road(group, interactRoots, { asphalt: asphalt, gravel: gravel });
  var pipeVisible = pipeAppearsThisRun();
  if (pipeVisible) addSilverPipe(group, interactRoots);

  var ambient = new THREE.AmbientLight(0x59616c, 0.28);
  group.add(ambient);
  var hemi = new THREE.HemisphereLight(0x6a7480, 0x1a1410, 0.2);
  group.add(hemi);
  var entranceLight = new THREE.PointLight(0x8aa3b8, 1.15, 16, 2);
  entranceLight.position.set(0, 4.2, 33);
  group.add(entranceLight);
  var pitLight = new THREE.PointLight(0x604438, 0.7, 10, 2);
  pitLight.position.set(L8_PLANK.x, 2.1, L8_PLANK.z);
  group.add(pitLight);
  var megLight = new THREE.PointLight(0xc9a36a, 0.45, 9, 2);
  megLight.position.set(L8_MEG_CAMP.x, 2.4, L8_MEG_CAMP.z);
  group.add(megLight);
  var roadLight = new THREE.PointLight(0xd8c89a, 1.05, 14, 2);
  roadLight.position.set(0, 3.4, -38);
  group.add(roadLight);

  return {
    group: group,
    colliders: colliders,
    interactRoots: interactRoots,
    spawnX: L8_SPAWN.x,
    spawnZ: L8_SPAWN.z,
    spawnYaw: L8_SPAWN_YAW,
    pipeVisible: pipeVisible,
    plankZone: L8_PLANK_ZONE,
    chickenHomes: L8_CHICKEN_HOMES,
    lighting: {
      ambient: ambient,
      hemi: hemi,
      entranceLight: entranceLight,
      pitLight: pitLight,
      materials: {
        darkRock: darkRock,
        midRock: midRock,
        floor: floorMat,
      },
    },
  };
}
