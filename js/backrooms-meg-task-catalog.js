/**
 * M.E.G. 委托目录。
 * general 是公开委托栏，不是第五种正式职务；其余四栏与职业一一对应。
 */

export const MEG_TASK_LANES = Object.freeze([
  "general",
  "explore",
  "research",
  "logistics",
  "security",
]);

export const MEG_TASK_LANE_LABELS = Object.freeze({
  general: "公开委托",
  explore: "探索专员",
  research: "研究专员",
  logistics: "后勤专员",
  security: "安保专员",
});

const MIN = 60 * 1000;

function def(value) {
  return Object.freeze(
    Object.assign(
      {
        offerChance: 1,
        refresh: "enter",
        completeLimit: 1,
        cooldownMs: 10 * MIN,
        kpi: "default",
        highRisk: false,
      },
      value,
      { rare: !!value.highRisk }
    )
  );
}

function field(id, title, lane, levels, reward, extra) {
  var list = Array.isArray(levels) ? levels : [levels];
  return def(
    Object.assign(
      {
        id: id,
        title: title,
        lane: lane,
        type: "field",
        fieldLevelIds: list,
        fieldTarget: list.length,
        reward: reward,
        desc:
          "按任务顺序抵达并记录：" +
          list.join(" → ") +
          "。记录齐全后回 Level 4 领赏。",
      },
      extra || {}
    )
  );
}

function parcel(id, title, lane, destination, reward, extra) {
  return def(
    Object.assign(
      {
        id: id,
        title: title,
        lane: lane,
        type: "package",
        packageId: id + "_parcel",
        packageName: title + "任务包",
        destinationLevelId: destination,
        autoDeliverOnEnter: true,
        reward: reward,
        kpi: "supply",
        deathPenalty: Math.max(5, Math.round(reward * 0.25)),
        desc:
          "携带任务包抵达 " +
          destination +
          " 的交接区域。中途死亡或任务包损毁将判定失败。",
      },
      extra || {}
    )
  );
}

/** 恰好 50 条：每栏 10 条。 */
export const MEG_TASK_CATALOG = Object.freeze([
  // 公开委托：白板每次最多挂 3 条。高危回路已挪到探索栏。
  def({
    id: "package_l1",
    title: "给 Level 1 基地运一个包裹",
    lane: "general",
    reward: 15,
    type: "package",
    packageId: "package_l1",
    packageName: "L1包裹",
    destinationLevelId: "l1",
    deathPenalty: 10,
    offerChance: 0.8,
    completeLimit: 3,
    cooldownMs: 5 * MIN,
    kpi: "supply",
    desc: "把包裹交给 Level 1 的 M.E.G. 收件员；中途死亡扣 10 积分。",
  }),
  def({
    id: "map_l21",
    title: "绘制 Level 21 地图",
    lane: "general",
    reward: 30,
    type: "map",
    drawLevelId: "l21",
    offerChance: 0.7,
    completeLimit: 2,
    cooldownMs: 5 * MIN,
    kpi: "mapping",
    desc: "前往 Level 21 按 E 绘制地图，再回 Level 4 交付。",
  }),
  def({
    id: "inspect_coolers",
    title: "Level 4 饮水机巡检",
    lane: "general",
    reward: 5,
    type: "inspect",
    inspectKind: "cooler",
    inspectTarget: 2,
    offerChance: 0.9,
    completeLimit: 4,
    cooldownMs: 5 * MIN,
    desc: "在 Level 4 对 2 台不同饮水机按 E 巡检；完成后自动领赏。",
  }),
  def({
    id: "map_l13",
    title: "绘制 Level 13 楼层平面",
    lane: "general",
    reward: 25,
    type: "map",
    drawLevelId: "l13",
    offerChance: 0.55,
    completeLimit: 2,
    cooldownMs: 5 * MIN,
    kpi: "mapping",
    desc: "前往 Level 13 按 E 绘制楼层平面，再回 Level 4 交付。",
  }),
  field("explore_measure_l9", "Level 9 郊区大道测距", "general", "l9", 50, { kpi: "mapping" }),
  field("general_snack_61", "零食室补给清点", "general", "l6_1", 12),
  field("general_manila_signs_l0", "Manila 路标抄录", "general", "l0", 20),
  field("general_farm_sample_l10", "Level 10 农田采样", "general", "l10", 18),
  field("general_painting_brief_l57", "主画目击简报", "general", "l57", 22),
  field("general_street_sign_l11", "Level 11 路牌抄录", "general", "l11", 28, {
    desc: "抵达 Level 11 完成街区路牌简报；禁止直视太阳。",
  }),

  // 探索专员
  def({
    id: "sample_c144_collapse",
    title: "塌楼灾情取样",
    lane: "explore",
    reward: 55,
    type: "recon",
    highRisk: true,
    refresh: "interval",
    refreshIntervalMs: 5 * MIN,
    deviceId: "sample_can_c144",
    deviceName: "M.E.G 采样罐",
    reconLevelId: "c144",
    reconTarget: 2,
    deathPenalty: 25,
    timeLimitMs: 25 * MIN,
    completeLimit: 2,
    cooldownMs: 30 * MIN,
    desc: "在 C-144 塌楼后对 2 处残墟取样，限时 25 分钟。",
  }),
  def({
    id: "beacon_c1299",
    title: "标记空间坐标",
    lane: "explore",
    reward: 420,
    type: "recon",
    highRisk: true,
    offerChance: 0.75,
    deviceId: "beacon_c1299",
    deviceName: "微型定位信标",
    deviceCount: 3,
    reconLevelId: "c1299",
    reconTarget: 3,
    deferDeliver: true,
    deathPenalty: 120,
    cooldownMs: 30 * MIN,
    rewardItems: [
      { id: "almond_water", name: "杏仁水", count: 2 },
      { id: "lucky_soy_milk", name: "幸运豆奶", count: 2 },
      { id: "strawberry_soy_milk", name: "草莓豆奶", count: 1 },
    ],
    desc: "在 C-1299 三个方位部署信标并从黑石撤离。",
  }),
  field("explore_map_l2", "Level 2 管廊主线测绘", "explore", "l2", 45, { kpi: "mapping" }),
  field("explore_nodes_l3", "Level 3 发电节点标记", "explore", "l3", 55, { kpi: "mapping" }),
  field("explore_map_l5", "Level 5 旅馆楼层对照", "explore", "l5", 60, { kpi: "mapping" }),
  field("explore_forks_l8", "Level 8 洞穴岔路编号", "explore", "l8", 70, { kpi: "mapping" }),
  def({
    id: "loop_c192",
    title: "封闭森林回路确认",
    lane: "explore",
    reward: 40,
    type: "recon",
    highRisk: true,
    reconLevelId: "c192",
    reconTarget: 1,
    deathPenalty: 15,
    offerChance: 0.4,
    completeLimit: 3,
    cooldownMs: 15 * MIN,
    desc: "在 C-192 停留满 90 秒并按 E 确认回路，再回 Level 4 领赏。",
  }),
  field("explore_landing_l48", "Level 48 安全落点确认", "explore", "l48", 65, { kpi: "mapping" }),
  field("explore_sqrt2_verify_l81", "Level 81→√2 切出验证", "explore", ["l81", "sqrt2"], 90, {
    highRisk: true,
    deathPenalty: 20,
  }),
  field("explore_corridor_c1", "C-1 交点走廊踏查", "explore", "c1", 85, { kpi: "mapping" }),

  // 研究专员
  def({
    id: "recon_c1291",
    title: "死区侦查记录｜井盖迷阵",
    lane: "research",
    reward: 260,
    type: "recon",
    highRisk: true,
    offerChance: 0.4,
    refresh: "interval",
    refreshIntervalMs: 3 * MIN,
    deviceId: "meg_recorder",
    deviceName: "M.E.G 特制记录设备",
    reconLevelId: "c1291",
    reconTarget: 3,
    deathPenalty: 50,
    timeLimitMs: 30 * MIN,
    cooldownMs: 45 * MIN,
    desc: "限时记录 C-1291 三个不同井盖，死亡或超时扣 50 积分。",
  }),
  def({
    id: "rubbing_c1290",
    title: "C-1290 拓片",
    lane: "research",
    reward: 100,
    type: "recon",
    highRisk: true,
    refresh: "interval",
    refreshIntervalMs: 5 * MIN,
    reconLevelId: "c1290",
    reconTarget: 3,
    deathPenalty: 40,
    cooldownMs: 35 * MIN,
    desc: "石化前拓印 C-1290 三块石碑并撤离。",
  }),
  def({
    id: "docs_c1292",
    title: "C-1292 实验档案回收",
    lane: "research",
    reward: 120,
    type: "recon",
    highRisk: true,
    refresh: "interval",
    refreshIntervalMs: 5 * MIN,
    reconLevelId: "c1292",
    reconTarget: 3,
    deathPenalty: 30,
    cooldownMs: 40 * MIN,
    desc: "阅读 C-1292 三份 U.E.C. 文档并撤离。",
  }),
  def({
    id: "recon_c144_mutant",
    title: "变异肢团活动周期记录",
    lane: "research",
    reward: 80,
    type: "recon",
    highRisk: true,
    refresh: "interval",
    refreshIntervalMs: 5 * MIN,
    deviceId: "meg_recorder",
    deviceName: "M.E.G 特制记录设备",
    reconLevelId: "c144",
    reconTarget: 2,
    deathPenalty: 35,
    timeLimitMs: 20 * MIN,
    completeLimit: 2,
    cooldownMs: 35 * MIN,
    desc: "记录 C-144 变异肢团活动与休息阶段，限时 20 分钟。",
  }),
  def({
    id: "sample_c1299_fog",
    title: "汤雾样本采集",
    lane: "research",
    reward: 220,
    type: "recon",
    highRisk: true,
    offerChance: 0.75,
    deviceId: "sample_can_c1299",
    deviceName: "密封采样罐",
    reconLevelId: "c1299",
    reconTarget: 1,
    deferDeliver: true,
    deathPenalty: 60,
    cooldownMs: 30 * MIN,
    kpi: "research",
    rewardItems: [{ id: "lucky_soy_milk", name: "幸运豆奶", count: 1 }],
    desc: "采集 C-1299 汤雾样本并从黑石撤离。",
  }),
  def({
    id: "pages_c1299",
    title: "高危调查：解读飘流残页",
    lane: "research",
    reward: 550,
    type: "recon",
    highRisk: true,
    alwaysOfferWhenUnlocked: true,
    requiresEverCompleted: ["sample_c1299_fog"],
    requireEverCount: 1,
    resetPrereqsOnCooldown: true,
    reconLevelId: "c1299",
    reconTarget: 4,
    deferDeliver: true,
    fragileItemIds: ["scrap_page_c1299"],
    deathPenalty: 160,
    cooldownMs: 60 * MIN,
    rewardItems: [
      { id: "level_key_l14", name: "层级密钥 · Level 14", count: 1 },
      { id: "almond_water", name: "杏仁水", count: 5 },
      { id: "lucky_soy_milk", name: "幸运豆奶", count: 2 },
      { id: "strawberry_soy_milk", name: "草莓豆奶", count: 2 },
      { id: "banana_soy_milk", name: "香蕉豆奶", count: 2 },
      { id: "fire_salt", name: "小块可爆炸火盐", count: 3 },
    ],
    desc: "前置完成后收集 4 份 C-1299 残页并安全撤离。",
  }),
  field("research_ntg_07", "Level 0.7 N.T.G. 摘录", "research", "0.7", 75, { kpi: "research" }),
  field("research_report_03", "Level 0.3 最终重建报告", "research", "0.3", 95, { kpi: "research" }),
  field("research_c101_logs", "C-101 机房日志备份", "research", "c101", 110, { kpi: "research" }),
  field("research_c2_depth", "C-2 景深失效记录", "research", "c2", 100, { kpi: "research" }),

  // 后勤专员
  parcel("logistics_supplies_l1", "Omega→Alpha 标准补给箱", "logistics", "l1", 20),
  parcel("logistics_restock_61", "Level 6.1 零食补货单", "logistics", "l6_1", 25),
  parcel("logistics_outpost_l11", "Beta 前哨物资包", "logistics", "l11", 35),
  field("logistics_relay_l2", "Alpha→Level 2 中继转运", "logistics", ["l1", "l2"], 40, {
    kpi: "supply",
    deathPenalty: 10,
  }),
  parcel("logistics_parts_l3", "Gamma 备用零件回收", "logistics", "l3", 45),
  parcel("logistics_l5_luggage", "Housekeeping 遗留箱清运", "logistics", "l5", 50),
  parcel("logistics_aid_l8", "岩洞系统急救包投放", "logistics", "l8", 55, {
    kpi: "rescue",
  }),
  parcel("logistics_c192_cache", "C-192 林缘补给点", "logistics", "c192", 60),
  parcel("logistics_vault_turnover_l4", "Omega 保险库周转箱", "logistics", "l4", 30),
  parcel("logistics_cold_soy", "高价值冷链：豆奶专送", "logistics", "l11", 80, {
    timeLimitMs: 12 * MIN,
    deathPenalty: 25,
  }),

  // 安保专员（不含军队、驻军或 NPC 护送）
  def({
    id: "security_inspect_deep_l4",
    title: "Omega 饮水机深度检修",
    lane: "security",
    reward: 15,
    type: "inspect",
    inspectKind: "cooler",
    inspectTarget: 4,
    completeLimit: 2,
    cooldownMs: 10 * MIN,
    desc: "巡检 Level 4 四台不同饮水机。",
  }),
  field("security_door_audit_l4", "Omega 门禁抽查", "security", "l4", 20),
  field("security_perimeter_l1", "Alpha 基地周界巡逻", "security", "l1", 35),
  field("security_pipe_watch_l2", "Level 2 高温管廊警戒", "security", "l2", 50),
  field("security_flare_l6", "Level 6 应急信号验证", "security", "l6", 70, { kpi: "rescue" }),
  field("security_instability_11", "Team Corridor 不安定监测", "security", "l1.1-2", 65),
  field("security_hotel_exit_l5", "Housekeeping 紧急出口核验", "security", "l5", 55),
  field("security_road_patrol_l9", "Level 9 大道路况巡查", "security", "l9", 75, {
    highRisk: true,
    deathPenalty: 20,
  }),
  field("security_record_c1297", "C-1297 封锁记录核验", "security", "c1297", 120, {
    highRisk: true,
    deathPenalty: 30,
  }),
  field("security_route_l11", "Beta 外围安全路线复核", "security", ["l6_1", "l11"], 80, {
    kpi: "rescue",
  }),
]);

export const MEG_TASK_IDS = Object.freeze(MEG_TASK_CATALOG.map(function (task) {
  return task.id;
}));

export const MEG_HIGH_RISK_TASK_IDS = Object.freeze(
  MEG_TASK_CATALOG.filter(function (task) {
    return task.highRisk;
  }).map(function (task) {
    return task.id;
  })
);

export function validateMegTaskCatalog() {
  var errors = [];
  var seen = Object.create(null);
  var counts = Object.create(null);
  for (var i = 0; i < MEG_TASK_LANES.length; i++) counts[MEG_TASK_LANES[i]] = 0;
  for (var j = 0; j < MEG_TASK_CATALOG.length; j++) {
    var task = MEG_TASK_CATALOG[j];
    if (!task.id || seen[task.id]) errors.push("任务 id 重复或为空：" + task.id);
    seen[task.id] = true;
    if (counts[task.lane] == null) errors.push("未知任务分类：" + task.lane);
    else counts[task.lane] += 1;
  }
  if (MEG_TASK_CATALOG.length !== 50) errors.push("任务总数必须为 50");
  for (var k = 0; k < MEG_TASK_LANES.length; k++) {
    var lane = MEG_TASK_LANES[k];
    if (counts[lane] !== 10) errors.push(lane + " 必须恰好 10 条任务");
  }
  return errors;
}
