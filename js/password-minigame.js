/**
 * 大厅小游戏 — 设置密码
 * 已解锁条件保留红/绿；前面有红条时，不显示「红条下一条」的再下一条。
 */
(function () {
  var ROMAN_VALUE = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

  function digitSum(pw) {
    var sum = 0;
    var i;
    for (i = 0; i < pw.length; i++) {
      var ch = pw[i];
      if (ch >= "0" && ch <= "9") sum += ch - "0";
      else if (ROMAN_VALUE[ch] != null) sum += ROMAN_VALUE[ch];
    }
    return sum;
  }

  function digitCount(pw) {
    return (pw.match(/\d/g) || []).length;
  }

  function specialCount(pw) {
    return (pw.match(/[^A-Za-z0-9]/g) || []).length;
  }

  function hasRoman(pw) {
    return /[IVXLCDM]/.test(pw);
  }

  function allArabicDigitsOdd(pw) {
    var digits = pw.match(/\d/g);
    if (!digits || !digits.length) return false;
    var i;
    for (i = 0; i < digits.length; i++) {
      if ("13579".indexOf(digits[i]) < 0) return false;
    }
    return true;
  }

  function todayDateNeed() {
    var day = new Date().getDate();
    var ones = day % 10;
    var tens = Math.floor(day / 10);
    var need = "";
    if (ones % 2 === 1) need = String(ones);
    else if (tens % 2 === 1) need = String(tens);
    return { day: day, need: need };
  }

  function hasTodayDateDigit(pw) {
    var info = todayDateNeed();
    var full = String(info.day);
    if (pw.indexOf(full) >= 0) return true;
    if (info.need && pw.indexOf(info.need) >= 0) return true;
    if (!info.need) return true;
    return false;
  }

  function todayDateRuleText() {
    var info = todayDateNeed();
    if (!info.need) {
      return "密码必须包含今天的日期数字（今日 " + info.day + " 号无奇数日号，本条成立）";
    }
    if (info.day < 10) {
      return "密码必须包含今天的日期数字（今日 " + info.day + " 号）";
    }
    return (
      "密码必须包含今天的日期数字（今日 " +
      info.day +
      " 号 · 含 " +
      info.day +
      " 或个位 " +
      info.need +
      " 即可）"
    );
  }

  function ruleText(rule) {
    return typeof rule.text === "function" ? rule.text() : rule.text;
  }

  var RULES = [
    {
      text: "密码必须包含数字",
      check: function (pw) {
        return /\d/.test(pw);
      },
    },
    {
      text: "密码必须只包含 3 个英文字母",
      check: function (pw) {
        return (pw.match(/[A-Za-z]/g) || []).length === 3;
      },
    },
    {
      text: "密码中只包含 1 个大写字母",
      check: function (pw) {
        return (pw.match(/[A-Z]/g) || []).length === 1;
      },
    },
    {
      text: "密码数字之和必须为 25（罗马数字计入）",
      check: function (pw) {
        return digitSum(pw) === 25;
      },
    },
    {
      text: "密码必须包含至少 1 个特殊字符",
      check: function (pw) {
        return specialCount(pw) >= 1;
      },
    },
    {
      text: "密码必须包含罗马数字（如大写 V）",
      check: function (pw) {
        return hasRoman(pw);
      },
    },
    {
      text: "密码特殊字符数量必须和数字数量相等",
      check: function (pw) {
        return specialCount(pw) === digitCount(pw) && digitCount(pw) > 0;
      },
    },
    {
      text: "密码里阿拉伯数字必须全是奇数",
      check: function (pw) {
        return allArabicDigitsOdd(pw);
      },
    },
    {
      text: todayDateRuleText,
      check: function (pw) {
        return hasTodayDateDigit(pw);
      },
    },
  ];

  var DONE_KEY = "jiwei_minigame1_done";
  var inputEl = document.getElementById("pwGameInput");
  var rulesEl = document.getElementById("pwGameRules");
  var winEl = document.getElementById("pwGameWin");
  var viewEl = document.getElementById("pwGameView");
  var revealed = 1;
  var enteringNext = false;

  function isDone() {
    try {
      return window.localStorage.getItem(DONE_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function markDone() {
    try {
      window.localStorage.setItem(DONE_KEY, "1");
    } catch (err) {
      /* ignore */
    }
  }

  function showView() {
    if (viewEl) viewEl.hidden = false;
  }

  function hideView() {
    if (viewEl) viewEl.hidden = true;
  }

  function checks(pw) {
    var ok = [];
    var i;
    for (i = 0; i < RULES.length; i++) {
      ok[i] = RULES[i].check(pw);
    }
    return ok;
  }

  function firstFailIndex(ok, upto) {
    var i;
    for (i = 0; i < upto; i++) {
      if (!ok[i]) return i;
    }
    return -1;
  }

  function evaluate(pw) {
    var ok = checks(pw);
    while (revealed < RULES.length) {
      var fail = firstFailIndex(ok, revealed);
      if (fail >= 0) break;
      revealed += 1;
    }
    var failAt = firstFailIndex(ok, revealed);
    var visible = revealed;
    if (failAt >= 0) {
      // 红条本身 + 它的下一条可以留着；再下一条不显示
      visible = Math.min(revealed, failAt + 2);
    }
    return {
      ok: ok,
      visible: visible,
      done: ok.every(Boolean) && visible === RULES.length,
    };
  }

  function render() {
    if (!rulesEl || !inputEl) return;
    var state = evaluate(inputEl.value || "");
    var html = "";
    var i;
    for (i = 0; i < state.visible; i++) {
      html +=
        '<li class="pw-game__rule' +
        (state.ok[i] ? " pw-game__rule--ok" : " pw-game__rule--bad") +
        '">' +
        '<span class="pw-game__rule-mark">' +
        (state.ok[i] ? "✓" : "✕") +
        "</span>" +
        "<span>" +
        ruleText(RULES[i]) +
        "</span></li>";
    }
    rulesEl.innerHTML = html;
    if (winEl) winEl.hidden = !state.done;
    if (state.done) enterGame2();
  }

  function enterGame2() {
    if (enteringNext) return;
    enteringNext = true;
    markDone();
    if (inputEl) inputEl.disabled = true;
    if (winEl) {
      winEl.hidden = false;
      winEl.textContent = "密码已设置。正在进入下一关…";
    }
    window.setTimeout(function () {
      if (window.PlatformMinigame && typeof window.PlatformMinigame.start === "function") {
        window.PlatformMinigame.start();
        return;
      }
      enteringNext = false;
      if (inputEl) inputEl.disabled = false;
      if (winEl) winEl.textContent = "下一关未就绪，请再开一次小游戏。";
    }, 400);
  }

  function reset() {
    if (isDone()) {
      hideView();
      return;
    }
    revealed = 1;
    enteringNext = false;
    showView();
    if (inputEl) inputEl.disabled = false;
    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }
    render();
  }

  if (inputEl) {
    inputEl.addEventListener("input", render);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Escape") return;
      e.stopPropagation();
    });
  }

  window.PasswordMinigame = {
    reset: reset,
    render: render,
    isDone: isDone,
    show: showView,
    hide: hideView,
  };
})();
