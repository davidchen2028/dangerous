export const C101_RESULT_KEY = "backrooms_c101_result_v1";

export const DEFAULT_C101_SOURCE = `// Level 1 临时控制脚本
// 修改后点击左上角 OK。刷新页面会恢复默认代码。
level1.setFog("#3a4a58", 8, 42);
level1.setLights("#dcecff", 1.0);
level1.setPillars({
  color: "#a8a39a",
  scale: 1.0,
  height: 1.0
});`;

function finiteIn(value, min, max, label) {
  var n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(label + " 必须在 " + min + " 到 " + max + " 之间");
  }
  return n;
}

function colorHex(value, label) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(label + " 必须是 #RRGGBB 颜色");
  }
  return value.toLowerCase();
}

export function validateC101Config(raw) {
  raw = raw && typeof raw === "object" ? raw : {};
  var fog = raw.fog && typeof raw.fog === "object" ? raw.fog : {};
  var lights = raw.lights && typeof raw.lights === "object" ? raw.lights : {};
  var pillars = raw.pillars && typeof raw.pillars === "object" ? raw.pillars : {};
  var near = finiteIn(fog.near == null ? 8 : fog.near, 1, 30, "雾起点");
  var far = finiteIn(fog.far == null ? 42 : fog.far, near + 3, 120, "雾终点");
  return {
    fog: {
      color: colorHex(fog.color || "#3a4a58", "雾颜色"),
      near: near,
      far: far,
    },
    lights: {
      color: colorHex(lights.color || "#dcecff", "灯光颜色"),
      intensity: finiteIn(
        lights.intensity == null ? 1 : lights.intensity,
        0.15,
        3,
        "灯光强度"
      ),
    },
    pillars: {
      color: colorHex(pillars.color || "#a8a39a", "柱子颜色"),
      scale: finiteIn(pillars.scale == null ? 1 : pillars.scale, 0.6, 1.45, "柱子宽度"),
      height: finiteIn(pillars.height == null ? 1 : pillars.height, 0.65, 1.35, "柱子高度"),
    },
  };
}

export function writeC101Result(result) {
  sessionStorage.setItem(C101_RESULT_KEY, JSON.stringify(result));
}

export function consumeC101Result() {
  var raw = sessionStorage.getItem(C101_RESULT_KEY);
  sessionStorage.removeItem(C101_RESULT_KEY);
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.ok !== true) return { ok: false, error: String(parsed.error || "代码运行失败") };
    return { ok: true, config: validateC101Config(parsed.config) };
  } catch (_err) {
    return { ok: false, error: "代码结果损坏" };
  }
}
