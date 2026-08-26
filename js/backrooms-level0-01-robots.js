/**
 * Level 0.1 天顶站机器人。
 * 仅提供视觉与路径巡逻，不注册实体、不产生攻击或伤害。
 */
import * as THREE from "three";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function makeRobotBody(shared, color, label) {
  var root = new THREE.Group();
  root.name = label;

  var bodyMat = color === "cook" ? shared.cookMat : shared.cleanMat;
  var body = new THREE.Mesh(shared.bodyGeo, bodyMat);
  body.position.y = 0.58;
  body.castShadow = true;
  root.add(body);

  var head = new THREE.Mesh(shared.headGeo, shared.metalMat);
  head.position.y = 1.03;
  head.castShadow = true;
  root.add(head);

  var eye = new THREE.Mesh(shared.eyeGeo, shared.eyeMat);
  eye.position.set(0, 1.06, 0.275);
  root.add(eye);

  var wheelL = new THREE.Mesh(shared.wheelGeo, shared.rubberMat);
  wheelL.rotation.z = Math.PI * 0.5;
  wheelL.position.set(-0.3, 0.22, 0);
  root.add(wheelL);
  var wheelR = wheelL.clone();
  wheelR.position.x = 0.3;
  root.add(wheelR);

  if (color === "cook") {
    var tray = new THREE.Mesh(shared.trayGeo, shared.metalMat);
    tray.position.set(0, 0.72, 0.43);
    root.add(tray);
  } else {
    var brush = new THREE.Mesh(shared.brushGeo, shared.cleanMat);
    brush.rotation.z = Math.PI * 0.5;
    brush.position.set(0, 0.14, 0.48);
    root.add(brush);
  }
  return root;
}

function samplePath(path, distance) {
  var total = 0;
  var lengths = [];
  var i;
  for (i = 0; i < path.length; i++) {
    var a = path[i];
    var b = path[(i + 1) % path.length];
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    var len = Math.sqrt(dx * dx + dz * dz);
    lengths.push(len);
    total += len;
  }
  if (!total) return { x: path[0].x, z: path[0].z, yaw: 0 };
  var cursor = ((distance % total) + total) % total;
  for (i = 0; i < path.length; i++) {
    if (cursor <= lengths[i]) {
      var from = path[i];
      var to = path[(i + 1) % path.length];
      var t = lengths[i] ? clamp01(cursor / lengths[i]) : 0;
      return {
        x: from.x + (to.x - from.x) * t,
        z: from.z + (to.z - from.z) * t,
        yaw: Math.atan2(to.x - from.x, to.z - from.z),
      };
    }
    cursor -= lengths[i];
  }
  return { x: path[0].x, z: path[0].z, yaw: 0 };
}

function makeRingPath(radius, startAngle, count) {
  var path = [];
  var i;
  for (i = 0; i < count; i++) {
    var angle = startAngle + (i / count) * Math.PI * 2;
    path.push({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius });
  }
  return path;
}

/**
 * @param {THREE.Object3D} parent
 * @param {object} [opts]
 * @param {number} [opts.ringRadius=16.8]
 * @returns {{group:THREE.Group,robots:Array,brokenRobots:Array,update:function(number):void,dispose:function():void}}
 */
export function createLevel01Robots(parent, opts) {
  opts = opts || {};
  var radius = Number.isFinite(opts.ringRadius) ? opts.ringRadius : 16.8;
  var disposed = false;
  var group = new THREE.Group();
  group.name = "Level01Robots";
  parent.add(group);

  var shared = {
    bodyGeo: new THREE.CylinderGeometry(0.34, 0.42, 0.7, 10),
    headGeo: new THREE.BoxGeometry(0.48, 0.3, 0.48),
    eyeGeo: new THREE.BoxGeometry(0.27, 0.07, 0.025),
    wheelGeo: new THREE.CylinderGeometry(0.13, 0.13, 0.1, 10),
    trayGeo: new THREE.BoxGeometry(0.68, 0.055, 0.48),
    brushGeo: new THREE.CylinderGeometry(0.06, 0.06, 0.74, 8),
    cableGeo: new THREE.CylinderGeometry(0.022, 0.022, 1, 6),
    cleanMat: new THREE.MeshStandardMaterial({
      color: 0xd8c94d,
      roughness: 0.48,
      metalness: 0.35,
    }),
    cookMat: new THREE.MeshStandardMaterial({
      color: 0xd6e0df,
      roughness: 0.38,
      metalness: 0.62,
    }),
    metalMat: new THREE.MeshStandardMaterial({
      color: 0x667177,
      roughness: 0.38,
      metalness: 0.78,
    }),
    rubberMat: new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.94 }),
    eyeMat: new THREE.MeshStandardMaterial({
      color: 0xbff8ff,
      emissive: 0x45cfee,
      emissiveIntensity: 1.25,
      roughness: 0.2,
    }),
    deadEyeMat: new THREE.MeshStandardMaterial({
      color: 0x241414,
      emissive: 0x2b0808,
      emissiveIntensity: 0.12,
      roughness: 0.9,
    }),
    cableMat: new THREE.MeshStandardMaterial({ color: 0x090909, roughness: 0.96 }),
  };

  var specs = [
    {
      kind: "cleaner",
      speed: 1.05,
      phase: 1.8,
      path: makeRingPath(radius, 0, 24),
    },
    {
      kind: "cleaner",
      speed: 0.84,
      phase: 18.5,
      path: makeRingPath(radius - 0.55, Math.PI, 24),
    },
    {
      kind: "cook",
      speed: 0.72,
      phase: 3.5,
      path: [
        { x: -17.1, z: -2.2 },
        { x: -20.1, z: -2.2 },
        { x: -20.1, z: 2.3 },
        { x: -17.1, z: 2.3 },
      ],
    },
  ];
  var robots = [];
  var i;
  for (i = 0; i < specs.length; i++) {
    var spec = specs[i];
    var mesh = makeRobotBody(shared, spec.kind === "cook" ? "cook" : "clean", "L01_" + spec.kind);
    group.add(mesh);
    robots.push({
      root: mesh,
      kind: spec.kind,
      speed: spec.speed,
      distance: spec.phase,
      path: spec.path,
      bob: i * 1.7,
    });
  }

  var brokenRobots = [];
  var brokenPositions = [
    { x: 12.8, z: -12.7, yaw: 1.15 },
    { x: 14.6, z: -10.8, yaw: -0.5 },
  ];
  for (i = 0; i < brokenPositions.length; i++) {
    var broken = makeRobotBody(shared, "clean", "L01_BrokenRobot");
    broken.position.set(brokenPositions[i].x, 0.18, brokenPositions[i].z);
    broken.rotation.set(0.2, brokenPositions[i].yaw, i ? -1.23 : 1.3);
    var eyeMesh = broken.children[2];
    if (eyeMesh) eyeMesh.material = shared.deadEyeMat;
    group.add(broken);
    brokenRobots.push(broken);

    var cable = new THREE.Mesh(shared.cableGeo, shared.cableMat);
    cable.position.set(
      brokenPositions[i].x + (i ? -0.55 : 0.5),
      0.04,
      brokenPositions[i].z + 0.25
    );
    cable.rotation.z = Math.PI * 0.5;
    cable.rotation.y = brokenPositions[i].yaw + 0.3;
    group.add(cable);
  }

  function update(dt) {
    if (disposed) return;
    var delta = Math.max(0, Math.min(Number(dt) || 0, 0.1));
    for (var ri = 0; ri < robots.length; ri++) {
      var robot = robots[ri];
      robot.distance += delta * robot.speed;
      robot.bob += delta * 4.2;
      var pose = samplePath(robot.path, robot.distance);
      robot.root.position.set(pose.x, Math.sin(robot.bob) * 0.012, pose.z);
      robot.root.rotation.y = pose.yaw;
      if (robot.kind === "cleaner" && robot.root.children[5]) {
        robot.root.children[5].rotation.y += delta * 5.5;
      }
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent) group.parent.remove(group);
    var key;
    for (key in shared) {
      if (shared[key] && shared[key].dispose) shared[key].dispose();
    }
    robots.length = 0;
    brokenRobots.length = 0;
    group.clear();
  }

  return {
    group: group,
    robots: robots,
    brokenRobots: brokenRobots,
    update: update,
    dispose: dispose,
  };
}

