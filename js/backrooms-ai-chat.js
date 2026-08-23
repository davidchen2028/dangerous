/**
 * 后室 NPC 自由对话。
 *
 * 浏览器这边不碰任何 API 密钥：只把「找谁说话 + 说了什么」发给同源的
 * /api/ai/chat，密钥留在服务端环境变量 JIWEI_AI_KEY 里。
 * 服务端没配密钥时接口返回 503，NPC 继续走原来的固定台词。
 *
 * 接入方式：在任意 level 的选项 HTML 里插一个 aiChoiceHtml("npc_id") 即可。
 * 进入自由对话前会把原对话的说话人/正文/选项快照下来，退出时原样还原，
 * 所以不会重复触发「交包裹」「发夜视药水」这类带副作用的开场逻辑。
 */

const CHAT_URL = "/api/ai/chat";
const TOKEN_KEY = "jiwei_token";
const HISTORY_LIMIT = 16;

/** 只用于对话框上的说话人标签，人设文本在服务端。 */
const NPC_NAMES = {
  l1_guide: "M.E.G 人员",
  l1_trade: "M.E.G 工作人员",
  l1_backdoor: "M.E.G 工作人员",
  l1_level11: "M.E.G 人员",
  l1_package: "M.E.G 收件员",
  l4_meg: "M.E.G 成员",
  l4_bntg: "B.N.T.G. 联络员",
  l11_vendor: "B.N.T.G 员工",
  l11_buyer: "B.N.T.G 收购员",
  l13_faceling: "无面灵",
  l57_painter: "画家",
  bntg_bank: "B.N.T.G. 银行人员",
  c144_clump: "受 Level 11 效应影响的肢团",
};

let els = null;
let snapshot = null;
let active = false;
let busy = false;
let reqToken = 0;
let currentNpc = "";
let inputEl = null;
const histories = new Map();

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || "";
  } catch (err) {
    return "";
  }
}

function histKey(npcId) {
  return "jiwei_ai_hist_" + npcId;
}

const FAKE_DEAL_RE =
  /(\d+\s*积分|积分\s*(换|一瓶|一件|买|卖)|(换|卖|买).{0,6}(瓶|水|气球)|派对气球|送你一|给你一瓶|成交了|赊账|保价)/;

function scrubHistoryList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (item) {
    if (!item || (item.role !== "user" && item.role !== "assistant")) return false;
    const content = String(item.content || "");
    if (!content) return false;
    if (item.role === "assistant" && FAKE_DEAL_RE.test(content)) return false;
    return true;
  });
}

function loadHistory(npcId) {
  if (histories.has(npcId)) return histories.get(npcId);
  let list = [];
  try {
    const raw = window.sessionStorage.getItem(histKey(npcId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = scrubHistoryList(parsed);
    }
  } catch (err) {
    list = [];
  }
  histories.set(npcId, list);
  try {
    window.sessionStorage.setItem(histKey(npcId), JSON.stringify(list));
  } catch (err2) {
    /* ignore */
  }
  return list;
}

function saveHistory(npcId, list) {
  histories.set(npcId, list);
  try {
    window.sessionStorage.setItem(histKey(npcId), JSON.stringify(list));
  } catch (err) {
    /* 存不下就只留内存 */
  }
}

function ensureStyle() {
  if (document.getElementById("brAiChatStyle")) return;
  const style = document.createElement("style");
  style.id = "brAiChatStyle";
  style.textContent = [
    ".br-ai{display:flex;flex-wrap:wrap;gap:8px;width:100%;align-items:center;}",
    ".br-ai__input{flex:1 1 160px;min-width:0;padding:6px 10px;border-radius:6px;",
    "border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);",
    "color:#e8f4ff;font:inherit;}",
    ".br-ai__input:focus{outline:none;border-color:rgba(160,200,255,0.45);}",
  ].join("");
  document.head.appendChild(style);
}

function resolveEls(custom) {
  if (custom && custom.dialogue) return custom;
  const byId = (a, b) => document.getElementById(a) || document.getElementById(b);
  const dialogue = byId("backroomsDialogue", "backroomsC144Dialogue");
  if (!dialogue) return null;
  return {
    dialogue: dialogue,
    speaker:
      document.getElementById("backroomsDialogueSpeaker") ||
      dialogue.querySelector(".backrooms-dialogue__speaker") ||
      null,
    text: byId("backroomsDialogueText", "backroomsC144DialogueText"),
    choices: byId("backroomsDialogueChoices", "backroomsC144DialogueChoices"),
  };
}

function choiceCls() {
  return document.getElementById("backroomsDialogueChoices")
    ? "backrooms-dialogue__choice"
    : "br-c144-dialogue__choice";
}

/** 生成一个「聊聊」选项按钮，插进任意 level 的选项 HTML 里即可。 */
export function aiChoiceHtml(npcId, label) {
  return (
    '<button type="button" class="' +
    choiceCls() +
    '" data-ai-chat="' +
    npcId +
    '">' +
    (label || "聊聊") +
    "</button>"
  );
}

/** 可选：自定义对话框元素（元素 id 与默认约定不同的页面用）。 */
export function registerAiChat(opts) {
  if (opts && opts.els) els = opts.els;
}

export function isAiChatOpen() {
  return active;
}

export function closeAiChat() {
  active = false;
  busy = false;
  reqToken++;
  inputEl = null;
  snapshot = null;
}

function setText(str) {
  if (els && els.text) els.text.textContent = str;
}

function exitChat() {
  const shot = snapshot;
  closeAiChat();
  if (!shot || !els) return;
  if (els.speaker && shot.speaker !== null) els.speaker.textContent = shot.speaker;
  if (els.text) els.text.textContent = shot.text;
  if (els.choices) {
    els.choices.innerHTML = shot.choices;
    els.choices.hidden = shot.choicesHidden;
  }
}

function renderChatInput() {
  if (!els || !els.choices) return;
  ensureStyle();
  const cls = choiceCls();
  els.choices.innerHTML =
    '<div class="br-ai">' +
    '<input type="text" class="br-ai__input" id="brAiInput" placeholder="想问点什么…" autocomplete="off">' +
    '<button type="button" class="' + cls + '" data-ai-act="send">发送</button>' +
    '<button type="button" class="' + cls + '" data-ai-act="back">返回</button>' +
    "</div>";
  inputEl = document.getElementById("brAiInput");
  if (inputEl) inputEl.focus();
}

/** 打开与某个 NPC 的自由对话。 */
export function startAiChat(npcId) {
  els = resolveEls(els);
  if (!els || !els.choices || !els.text) return;
  if (!NPC_NAMES[npcId]) return;
  if (!active) {
    snapshot = {
      speaker: els.speaker ? els.speaker.textContent : null,
      text: els.text.textContent,
      choices: els.choices.innerHTML,
      choicesHidden: !!els.choices.hidden,
    };
  }
  active = true;
  currentNpc = npcId;
  els.choices.hidden = false;
  if (els.speaker) els.speaker.textContent = NPC_NAMES[npcId];
  const hist = loadHistory(npcId);
  const last = hist.length ? hist[hist.length - 1] : null;
  setText(last && last.role === "assistant" ? last.content : "……说吧。");
  renderChatInput();
}

async function send() {
  if (busy || !inputEl) return;
  const userText = String(inputEl.value || "").trim();
  if (!userText) return;
  const npcId = currentNpc;
  const token = ++reqToken;
  busy = true;
  inputEl.value = "";
  setText("（对方在想……）");

  let reply = "";
  let failed = "";
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npc: npcId,
        text: userText,
        token: readToken(),
        history: loadHistory(npcId),
      }),
    });
    const data = await res.json().catch(function () {
      return null;
    });
    if (data && data.ok && data.reply) {
      reply = String(data.reply);
    } else if (data && data.message) {
      failed = String(data.message);
    } else if (res.status === 404) {
      failed = "服务器版本太旧，重启服务器后再试。";
    } else {
      failed = "对话服务异常（HTTP " + res.status + "）。";
    }
  } catch (err) {
    failed = "连不上服务器。";
  }

  if (token !== reqToken || !active) return;
  busy = false;
  if (failed) {
    setText(failed);
    if (inputEl) inputEl.focus();
    return;
  }
  setText(reply);
  const hist = loadHistory(npcId).slice();
  hist.push({ role: "user", content: userText });
  hist.push({ role: "assistant", content: reply });
  saveHistory(npcId, hist.slice(-HISTORY_LIMIT));
  if (inputEl) inputEl.focus();
}

document.addEventListener("click", function (e) {
  const start = e.target.closest("[data-ai-chat]");
  if (start) {
    e.preventDefault();
    e.stopPropagation();
    startAiChat(start.getAttribute("data-ai-chat"));
    return;
  }
  if (!active) return;
  const act = e.target.closest("[data-ai-act]");
  if (!act) return;
  e.preventDefault();
  e.stopPropagation();
  const kind = act.getAttribute("data-ai-act");
  if (kind === "send") send();
  else if (kind === "back") exitChat();
});

// 捕获阶段先于各 level 的 window keydown 处理，避免打字时触发 A/B/Q 等游戏按键。
window.addEventListener(
  "keydown",
  function (e) {
    if (!active || !inputEl || document.activeElement !== inputEl) return;
    e.stopPropagation();
    if (e.code === "Escape") {
      e.preventDefault();
      exitChat();
      return;
    }
    if (e.code !== "Enter" && e.code !== "NumpadEnter") return;
    // 中文输入法选词时的回车不算发送
    if (e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send();
  },
  true
);

window.addEventListener(
  "keyup",
  function (e) {
    if (active && inputEl && document.activeElement === inputEl) e.stopPropagation();
  },
  true
);
