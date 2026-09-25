/**
 * M.E.G. 后勤草案 · 流浪者自建营地
 * 设计文，尚未实装。可供指南 / 档案查看器直接渲染。
 */

export const PLAYER_CAMP_ARTICLE = Object.freeze({
  id: "meg_logistics_player_camp_v1",
  classification: "后勤草案 · 未实装",
  eyebrow: "M.E.G. ALPHA 后勤处",
  title: "流浪者自建营地",
  subtitle: "认一块地，放下营地包，在格子里摆预制件。不是第二座 M.E.G. 基地。",
  date: "2026-09-24",
  sections: Object.freeze([
    Object.freeze({
      heading: "现状",
      paragraphs: Object.freeze([
        "游戏里已经有官方基地，没有玩家自建。Level 1 / Level 4 的 M.E.G.、Level 11 的 B.N.T.G.、Level 1.1 前哨都是写死的房间：寄存柜、存档复活、禁伤害。背包是消耗品；industrial_supplies、circuit、alloy_plate 已经退役。联机世界只同步人、战斗和拾取，不改地形。",
        "因此不能做成 Minecraft 式自由堆方块，而应做成：认一块地 → 放下营地包 → 在格子里摆预制件。",
      ]),
    }),
    Object.freeze({
      heading: "定位",
      paragraphs: Object.freeze([
        "玩家营地是流浪者据点，不是第二座 M.E.G.。官方基地继续管任务、100 格寄存、死亡复活。营地管：睡觉回理智、小箱子、灯、简易墙，以及一个回城信标。",
        "职级对齐现成权限：前哨主管起拥有 outpost_manage，才能把营地登记成官方前哨（别人地图上可见、可共享箱子）。普通人只建私人营地。",
      ]),
    }),
    Object.freeze({
      heading: "形态：信标门 + 口袋房间",
      paragraphs: Object.freeze([
        "和 B.N.T.G. 银行、Level 1.1 前哨同一套路：大地图上只放一个门或信标，走进去才是营地内部。",
        "Level 1 仓库是共享层，柱、箱、实体仍在外面。准星或走进营地门后，进入 8×8 口袋房间，最多摆 12 个预制件，出口回到原坐标。",
        "这样选，是因为 Level 1 是流式 9×9 区块，不能在柱子和 M.E.G. 走廊上随便砌墙；口袋房间碰撞简单，和 B.N.T.G. 独立基地一样；联机先只同步「门在哪」，不用同步每一块墙。以后若要露天营地，门可以改成地面铺装，内部逻辑不用推翻。",
      ]),
    }),
    Object.freeze({
      heading: "认领",
      paragraphs: Object.freeze([
        "每局或每个账号只允许一座营地。只能建在 Level 1，且同时满足：离出生点超过 24 米、不在 M.E.G. 基地 AABB、不挡实体 81 的门、脚下无柱无箱。",
        "消耗「营地包」一件。来源是 M.E.G. 商店积分，或仓库搜刮——把退役工业物资收成 camp_kit，不要复活整套合成树。",
      ]),
    }),
    Object.freeze({
      heading: "建造",
      paragraphs: Object.freeze([
        "不是连续网格，是吸附到 1 米格的预制件。第一版目录只有六种：床、箱（8 格）、灯、矮墙、工作台、牌子。内部上限约 12 件。",
        "摆放用准星加 R（沿用现有使用键），预览幽灵网格；拆除用 Q，收回八成材料。碰撞用现成 AABB，交互用 brInteract 与准星拾取。",
      ]),
    }),
    Object.freeze({
      heading: "第一版就要能玩的功能",
      paragraphs: Object.freeze([
        "床：交互后记营地复活点。次于 M.E.G. 存档——没去过官方基地才回营地。",
        "箱：独立 8 格，死亡不清；和 100 格编制柜分开，任务道具仍不能存。",
        "灯：降低营地内理智流失。",
        "出口：回到 Level 1 门前坐标，并续 clip 令牌。",
      ]),
    }),
    Object.freeze({
      heading: "明确不做",
      paragraphs: Object.freeze([
        "不能拆官方墙，不能建在 Level 4 / Level 11 基地内，不能挡住 M.E.G. 走廊。",
        "不能当跨层传送器，避免和钥匙、通行证抢入口。",
        "不开放自由长宽高，避免穿模和联机爆炸。",
      ]),
    }),
    Object.freeze({
      heading: "数据",
      paragraphs: Object.freeze([
        "每座营地记录：编号、主人、层级 clip、门的坐标与朝向、内部预制件的格坐标与旋转、8 格箱子、床是否已设。",
        "第一阶段单机写入 sessionStorage，跟背包同一局，只有自己看见门。第二阶段登录后写入账号档，和 M.E.G. 档案、服务端背包并列，仍只有自己看见。第三阶段联机世界带上 camps 列表，同层可见门，进内部仍是个人副本。",
        "局重置清掉未登记营地；已登记前哨跟账号走。",
      ]),
    }),
    Object.freeze({
      heading: "落地拆分",
      paragraphs: Object.freeze([
        "P0 能建、能进、能睡：认领校验与格吸附、门加 8×8 口袋房间、新令牌 camp、商店可买的营地包、R 进入放置预览。测试距 M.E.G. 或出生点过近失败、柱上失败、第二座失败、床能写复活点。",
        "P1 能住：六种预制件、营地箱、灯降理智、拆除回收、HUD「营地 · 按 Q 进入」、任务「在 Level 1 立起一座流浪者营地」。",
        "P2 能共享：联机快照带上门的位置；进别人门只读参观，或职级够了才开共享箱；服务端禁伤圈扩到门周围 3 米；前哨主管登记后门上出现 M.E.G. 布标，下线不消失。",
        "P3 以后再说：第二座营地、Level 9 / 11 露天铺装、防御、被实体拆掉。没有 P0 稳定前不要动。",
      ]),
    }),
    Object.freeze({
      heading: "和现有系统怎么接",
      paragraphs: Object.freeze([
        "100 格编制寄存柜不动；营地箱是另一份 8 格。",
        "官方存档优先；无官方档才回营地床。",
        "outpost_manage 只做「登记前哨」，不做建造本身。",
        "Level 1.1 前哨继续是剧本房。C-1623 Prismriver 仍是 wiki 彩蛋，不给建。",
        "联机世界先不同步内部摆件。营地包和墙板走背包现有的使用键。",
      ]),
    }),
    Object.freeze({
      heading: "风险",
      paragraphs: Object.freeze([
        "Level 1 流式卸载会吞掉门：门必须挂在不随区块回收的根上，或按区块键重刷。",
        "口袋房间若做成独立页面，返回要用令牌并记住坐标朝向，别误送回出生点。",
        "联机若过早同步每块墙，带宽和作弊都会爆；门的位置足够。",
        "营地复活不要绕开 C-1289「没死透」和 M.E.G. 回城那两条特例。",
      ]),
    }),
    Object.freeze({
      heading: "结论",
      paragraphs: Object.freeze([
        "P0 只要一个营地包、一扇门、一个空房间、一张床。P1 才是自己装修。",
      ]),
    }),
  ]),
});

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 档案查看器那种纯文本。 */
export function playerCampArticleText() {
  var article = PLAYER_CAMP_ARTICLE;
  var lines = [
    "【" + article.eyebrow + " · " + article.title + "】",
    "分类：" + article.classification,
    "日期：" + article.date,
    "",
    article.subtitle,
    "",
  ];
  var i;
  var j;
  for (i = 0; i < article.sections.length; i++) {
    var section = article.sections[i];
    lines.push("· " + section.heading);
    for (j = 0; j < section.paragraphs.length; j++) {
      lines.push(section.paragraphs[j]);
    }
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

/** 编制说明那种 HTML。 */
export function playerCampArticleHtml() {
  var article = PLAYER_CAMP_ARTICLE;
  var html =
    '<article class="backrooms-meg-guide__panel" role="document">' +
    "<header><div>" +
    '<p class="backrooms-meg-guide__eyebrow">' +
    escapeHtml(article.eyebrow) +
    " · " +
    escapeHtml(article.classification) +
    "</p>" +
    "<h1>" +
    escapeHtml(article.title) +
    "</h1></div></header>" +
    '<div class="backrooms-meg-guide__body">' +
    "<p><em>" +
    escapeHtml(article.subtitle) +
    "</em></p>" +
    "<p>日期 " +
    escapeHtml(article.date) +
    "</p>";
  var i;
  var j;
  for (i = 0; i < article.sections.length; i++) {
    var section = article.sections[i];
    html += "<section><h2>" + escapeHtml(section.heading) + "</h2>";
    for (j = 0; j < section.paragraphs.length; j++) {
      html += "<p>" + escapeHtml(section.paragraphs[j]) + "</p>";
    }
    html += "</section>";
  }
  return html + "</div></article>";
}
