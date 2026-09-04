import * as THREE from "three";
import { buildNormalMothFigure, buildDeathMothFigure } from "./backrooms-moth.js";
import { buildClumpFigure } from "./backrooms-clump.js";
import { buildPartygoerFigure } from "./backrooms-partygoer.js";

export const AUTHOR_MODEL_CATEGORIES = Object.freeze({
  doors: "门",
  offices: "办公室",
  people: "人物",
  monsters: "怪物",
});

const mat = (color, extra) =>
  new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.78 }, extra || {}));

function box(group, size, pos, material, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function sphere(group, radius, pos, material, name, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 13), material);
  mesh.position.set(...pos);
  mesh.scale.set(sx, sy, sz);
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function cylinder(group, radii, height, pos, material, name) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radii[0], radii[1], height, 16),
    material
  );
  mesh.position.set(...pos);
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function wrap(group, update) {
  group.position.y = 0;
  return { group, update: update || null };
}

function buildDoor(style) {
  const g = new THREE.Group();
  const frame = mat(style === "red" ? 0x501c1c : 0x343a40, { metalness: 0.35 });
  const colors = {
    industrial: 0x515861,
    wood: 0x68452d,
    rainbow: 0x754a90,
    black: 0x050607,
    red: 0x8e2025,
    iron: 0x2f3538,
  };
  const panel = mat(colors[style] || colors.industrial, {
    metalness: style === "wood" ? 0.05 : 0.28,
    emissive: style === "rainbow" ? 0x30164a : 0x000000,
    emissiveIntensity: style === "rainbow" ? 0.8 : 0,
  });
  box(g, [0.16, 3.1, 0.28], [-0.86, 1.55, 0], frame);
  box(g, [0.16, 3.1, 0.28], [0.86, 1.55, 0], frame);
  box(g, [1.88, 0.18, 0.28], [0, 3.02, 0], frame);
  const door = box(g, [1.5, 2.82, 0.14], [0, 1.42, 0], panel, "ShowcaseDoorPanel");
  if (style === "rainbow") {
    const stripes = [0xff426d, 0xff9a3c, 0xffe45b, 0x53d879, 0x4fa9ff, 0xb168ef];
    stripes.forEach((color, i) =>
      box(g, [1.38, 0.4, 0.025], [0, 0.35 + i * 0.42, -0.085], mat(color, {
        emissive: color,
        emissiveIntensity: 0.28,
      }))
    );
  }
  if (style === "iron") {
    for (let i = -3; i <= 3; i++) {
      box(g, [0.09, 2.65, 0.12], [i * 0.2, 1.43, -0.1], frame);
    }
    box(g, [1.45, 0.1, 0.12], [0, 0.65, -0.1], frame);
    box(g, [1.45, 0.1, 0.12], [0, 2.2, -0.1], frame);
    door.visible = false;
  }
  if (style !== "black" && style !== "iron") {
    sphere(g, 0.08, [0.56, 1.35, -0.12], mat(0xd5bf72, { metalness: 0.8 }), "DoorHandle");
  }
  return wrap(g);
}

function buildEl3aEntrance() {
  const g = new THREE.Group();
  const wall = mat(0x706c64);
  const metal = mat(0x29343b, { metalness: 0.45 });
  box(g, [5.8, 0.16, 3.6], [0, 3.25, 1.1], mat(0x20242a));
  box(g, [1.8, 3.2, 0.18], [-2, 1.6, 0], wall);
  box(g, [1.8, 3.2, 0.18], [2, 1.6, 0], wall);
  box(g, [2.2, 0.5, 0.18], [0, 2.95, 0], wall);
  box(g, [1.65, 0.58, 0.1], [0, 2.58, -0.12], mat(0x9ecce0, {
    emissive: 0x4b8197,
    emissiveIntensity: 0.75,
  }), "EL3A");
  box(g, [1.35, 0.08, 0.04], [0, 2.58, -0.18], metal);
  for (let i = -1; i <= 1; i += 2) {
    cylinder(g, [0.08, 0.08], 3.1, [i * 2.55, 1.55, 1.1], mat(0x555c60, {
      metalness: 0.65,
    }), "OfficePipe");
  }
  return wrap(g);
}

function buildOfficeInterior(kind) {
  const g = new THREE.Group();
  const wall = mat(kind === "command" ? 0x465363 : 0x827e73);
  const wood = mat(0x68482f);
  const dark = mat(0x252d32, { metalness: 0.3 });
  box(g, [6, 0.12, 5], [0, 0, 0.8], mat(0x34383a));
  box(g, [6, 3.4, 0.14], [0, 1.7, 3.3], wall);
  box(g, [0.14, 3.4, 5], [-3, 1.7, 0.8], wall);
  box(g, [0.14, 3.4, 5], [3, 1.7, 0.8], wall);
  box(g, [2.2, 0.78, 0.8], [0, 0.39, 1.65], wood, "OfficeDesk");
  box(g, [0.85, 0.52, 0.13], [0, 1.12, 1.55], mat(0x132b34, {
    emissive: 0x2e7284,
    emissiveIntensity: 0.7,
  }), "OfficeMonitor");
  box(g, [0.64, 0.9, 0.64], [-0.72, 0.45, 0.35], dark, "OfficeChair");
  box(g, [0.9, 1.8, 0.62], [2.25, 0.9, 2.55], dark, "FileCabinet");
  box(g, [1.5, 0.07, 0.32], [0, 3.25, 0.7], mat(0xe6dfc9, {
    emissive: 0xc6b990,
    emissiveIntensity: 1.2,
  }), "OfficeLamp");
  return wrap(g);
}

function buildHumanoid(opts = {}) {
  const g = new THREE.Group();
  const scale = opts.scale || 1;
  const skin = mat(opts.skin || 0xb98561);
  const clothes = mat(opts.clothes || 0x40576d);
  const dark = mat(opts.dark || 0x1e2831);
  box(g, [0.25, 0.82, 0.3], [-0.16, 0.41, 0], dark);
  box(g, [0.25, 0.82, 0.3], [0.16, 0.41, 0], dark);
  box(g, [0.62, 0.78, 0.36], [0, 1.2, 0], clothes, "HumanTorso");
  box(g, [0.18, 0.68, 0.2], [-0.42, 1.18, 0], clothes);
  box(g, [0.18, 0.68, 0.2], [0.42, 1.18, 0], clothes);
  const head = box(g, [0.38, 0.38, 0.38], [0, 1.8, 0], opts.faceless ? mat(0xc6c0b2) : skin, "HumanHead");
  if (opts.mask) box(g, [0.32, 0.19, 0.04], [0, 1.8, -0.21], mat(0x151a1d), "Visor");
  if (opts.badge) box(g, [0.14, 0.18, 0.03], [0.19, 1.28, -0.2], mat(0x6bb9db, {
    emissive: 0x23586d,
    emissiveIntensity: 0.5,
  }), "MegBadge");
  if (opts.hair) box(g, [0.4, 0.14, 0.42], [0, 2.01, 0], mat(opts.hair), "Hair");
  g.scale.setScalar(scale);
  let phase = 0;
  return wrap(g, (dt) => {
    phase += dt;
    head.rotation.y = Math.sin(phase * 0.8) * 0.08;
  });
}

function buildRobot() {
  const g = new THREE.Group();
  const metal = mat(0x717b80, { metalness: 0.72 });
  cylinder(g, [0.42, 0.48], 0.7, [0, 0.55, 0], metal, "RobotBody");
  cylinder(g, [0.3, 0.3], 0.28, [0, 1.08, 0], mat(0x343d42), "RobotHead");
  sphere(g, 0.055, [-0.12, 1.1, -0.29], mat(0x5fdcff, {
    emissive: 0x5fdcff,
    emissiveIntensity: 2,
  }));
  sphere(g, 0.055, [0.12, 1.1, -0.29], mat(0x5fdcff, {
    emissive: 0x5fdcff,
    emissiveIntensity: 2,
  }));
  cylinder(g, [0.1, 0.1], 0.22, [-0.28, 0.12, -0.25], metal);
  cylinder(g, [0.1, 0.1], 0.22, [0.28, 0.12, -0.25], metal);
  return wrap(g);
}

function buildSmiler() {
  const g = new THREE.Group();
  sphere(g, 1.35, [0, 1.5, 0.25], mat(0x020203), "SmilerVoid", 1.25, 1, 0.35);
  const glow = mat(0xf4f6ee, { emissive: 0xffffff, emissiveIntensity: 3 });
  sphere(g, 0.15, [-0.42, 1.78, -0.2], glow, "SmilerEye", 1, 0.42, 0.3);
  sphere(g, 0.15, [0.42, 1.78, -0.2], glow, "SmilerEye", 1, 0.42, 0.3);
  const teeth = 9;
  for (let i = 0; i < teeth; i++) {
    const a = -0.85 + (i / (teeth - 1)) * 1.7;
    box(g, [0.13, 0.25, 0.06], [a, 1.22 - Math.abs(a) * 0.23, -0.2], glow, "SmilerTooth");
  }
  return wrap(g);
}

function buildHound(growler = false) {
  const g = new THREE.Group();
  const flesh = mat(growler ? 0x34312d : 0x63483f);
  const dark = mat(0x151414);
  sphere(g, 0.52, [0, 0.78, 0.15], flesh, growler ? "GrowlerBody" : "HoundBody", 1.25, 0.72, 1.7);
  sphere(g, 0.34, [0, 0.92, -0.9], flesh, "HoundHead", 1.1, 0.85, 1.2);
  for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.55]) {
    const leg = cylinder(g, [0.11, 0.15], 0.72, [x, 0.38, z], flesh, "HoundLeg");
    leg.rotation.z = x < 0 ? -0.16 : 0.16;
  }
  sphere(g, 0.055, [-0.13, 1.02, -1.24], mat(0xff351e, {
    emissive: 0xff2000,
    emissiveIntensity: 2,
  }));
  sphere(g, 0.055, [0.13, 1.02, -1.24], mat(0xff351e, {
    emissive: 0xff2000,
    emissiveIntensity: 2,
  }));
  box(g, [0.28, 0.12, 0.1], [0, 0.79, -1.26], dark);
  return wrap(g);
}

function buildDuller() {
  const built = buildHumanoid({ clothes: 0x4b5356, skin: 0x8b8880, scale: 0.86, faceless: true });
  built.group.scale.set(1.1, 0.82, 1.25);
  built.group.name = "Duller";
  return built;
}

function buildChicken() {
  const g = new THREE.Group();
  const white = mat(0xd6d1c3);
  sphere(g, 0.48, [0, 0.62, 0], white, "ChickenBody", 0.85, 1, 1.15);
  sphere(g, 0.27, [0, 1.08, -0.35], white, "ChickenHead");
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 4), mat(0xd69a32));
  beak.position.set(0, 1.04, -0.65);
  beak.rotation.x = -Math.PI / 2;
  g.add(beak);
  for (const x of [-0.16, 0.16]) cylinder(g, [0.035, 0.035], 0.42, [x, 0.22, 0], mat(0x9d6c32));
  sphere(g, 0.045, [-0.1, 1.15, -0.57], mat(0x111111));
  sphere(g, 0.045, [0.1, 1.15, -0.57], mat(0x111111));
  return wrap(g);
}

function buildDrowned() {
  const built = buildHumanoid({
    clothes: 0x273f42,
    skin: 0x5f7d78,
    dark: 0x182d30,
    hair: 0x172526,
  });
  built.group.name = "Drowned";
  built.group.rotation.z = -0.08;
  return built;
}

function fromFigure(figure) {
  let elapsed = 0;
  return {
    group: figure.group,
    update: typeof figure.update === "function"
      ? (dt) => {
          elapsed += dt;
          figure.update(elapsed);
        }
      : null,
  };
}

const entries = [
  ["door-industrial", "doors", "工业金属门", "Level 2", "无限工业隧道中的标准出口门。", () => buildDoor("industrial")],
  ["door-wood", "doors", "旧木门", "Level 2 / Hub", "通向未知层级的木制门体。", () => buildDoor("wood")],
  ["door-rainbow", "doors", "彩虹门", "Level 2 → Level 283", "具有六色发光面板的异常出口。", () => buildDoor("rainbow")],
  ["door-black", "doors", "无光黑门", "Level 1.1", "几乎不反射环境光的黑色门体。", () => buildDoor("black")],
  ["door-red", "doors", "红室入口", "Level 0", "通向红色通道的高饱和门。", () => buildDoor("red")],
  ["door-iron", "doors", "工业铁栅门", "行动场景", "重型竖栏铁门的静态展示版本。", () => buildDoor("iron")],
  ["office-el3a", "offices", "EL3A 办公室入口", "Level 2", "从无限隧道斜向支路进入的管线办公室。", buildEl3aEntrance],
  ["office-el3a-room", "offices", "EL3A 办公室内部", "Level 2", "包含桌椅、显示器、文件柜和顶灯。", () => buildOfficeInterior("el3a")],
  ["office-command", "offices", "战术指挥办公室", "M.E.G. 设施", "以蓝灰墙体和工业家具构成的指挥空间。", () => buildOfficeInterior("command")],
  ["person-meg", "people", "M.E.G. 招募员", "M.E.G. 前哨", "佩戴识别章的前哨工作人员。", () => buildHumanoid({ clothes: 0x674a87, badge: true })],
  ["person-staff", "people", "M.E.G. 职员", "Level 1", "基地内常见的蓝制服职员。", () => buildHumanoid({ clothes: 0x315d7a, badge: true })],
  ["person-wanderer", "people", "流浪者", "多个层级", "随机衣着与发型的普通流浪者代表。", () => buildHumanoid({ clothes: 0x775740, hair: 0x302219 })],
  ["person-guard", "people", "C-101 Ω 守卫", "Level C-101", "佩戴战术面甲的档案路线守卫。", () => buildHumanoid({ clothes: 0x27333d, mask: true })],
  ["person-painter", "people", "画家", "Level 57", "画廊中的人类艺术家代表模型。", () => buildHumanoid({ clothes: 0x687e58, hair: 0x493325 })],
  ["person-robot", "people", "服务机器人", "Level 0.1", "天顶站内执行清扫和服务工作的机器人。", buildRobot],
  ["monster-smiler", "monsters", "笑靥", "Level 2 / 5", "黑暗中只显露眼睛与牙齿的实体。", buildSmiler],
  ["monster-moth", "monsters", "普通飞蛾", "未接入层级", "死亡飞蛾的普通体型原型。", () => fromFigure(buildNormalMothFigure({ scale: 0.72 }))],
  ["monster-death-moth", "monsters", "死亡飞蛾", "Level 2 / 3 / 5", "具有持续振翅动画的大型飞蛾。", () => fromFigure(buildDeathMothFigure({ scale: 0.72 }))],
  ["monster-clump", "monsters", "肢团", "Level 2 / 5", "由肉核与多条肢体融合形成的实体。", () => fromFigure(buildClumpFigure({ scale: 0.82, seed: 4 }))],
  ["monster-hound", "monsters", "猎犬", "Level 2 / C-1", "低伏移动的四足追击实体。", () => buildHound(false)],
  ["monster-partygoer", "monsters", "派对客", "Level C-101", "携带气球、带固定笑脸的黄色实体。", () => fromFigure(buildPartygoerFigure({ scale: 0.82, seed: 3 }))],
  ["monster-faceling", "monsters", "成年无面灵", "Level 13 / C-1", "没有五官的人形实体。", () => buildHumanoid({ clothes: 0x6d655b, faceless: true })],
  ["monster-duller", "monsters", "钝人", "Level C-1", "矮壮、动作迟缓的人形实体。", buildDuller],
  ["monster-chicken", "monsters", "后室鸡", "Level 8", "洞穴区域出现的异常禽类。", buildChicken],
  ["monster-wanderer", "monsters", "敌对流浪者", "多个层级", "进入敌对状态的人类流浪者。", () => buildHumanoid({ clothes: 0x632f31, hair: 0x241a18 })],
  ["monster-drowned", "monsters", "溺尸", "Level 0.5", "从积水中追击玩家的湿身人形。", buildDrowned],
  ["monster-growler", "monsters", "Growler", "Level 0.7", "深区出现的暗色四足追击体。", () => buildHound(true)],
];

export const AUTHOR_MODEL_CATALOG = Object.freeze(entries.map((entry) => Object.freeze({
  id: entry[0],
  category: entry[1],
  title: entry[2],
  source: entry[3],
  description: entry[4],
  build: entry[5],
})));

export function getAuthorModels(category) {
  return AUTHOR_MODEL_CATALOG.filter((entry) => entry.category === category);
}

export function disposeAuthorModel(built) {
  if (!built || !built.group) return;
  built.group.traverse((obj) => {
    if (obj.geometry && typeof obj.geometry.dispose === "function") obj.geometry.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.filter(Boolean).forEach((material) => {
      if (material.map && typeof material.map.dispose === "function") material.map.dispose();
      if (typeof material.dispose === "function") material.dispose();
    });
  });
  if (built.group.parent) built.group.parent.remove(built.group);
}
