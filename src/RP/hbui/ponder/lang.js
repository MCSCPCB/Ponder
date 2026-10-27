// UI strings, from Ponder's assets/ponder/lang (en_us, zh_cn).
(function () {
  const P = window.Ponder;
  const LANG = {
    en_us: {
      "ui.pondering": "Pondering about...",
      "ui.pondering_tag": "Pondering about...",
      "ui.identify_mode": "Identify mode active.\nUnpause with [%1$s]",
      "ui.associated": "Associated Entries",
      "ui.close": "Close",
      "ui.identify": "Identify",
      "ui.next": "Next Scene",
      "ui.next_up": "Up Next:",
      "ui.previous": "Previous Scene",
      "ui.replay": "Replay",
      "ui.think_back": "Think Back",
      "ui.slow_text": "Comfy Reading",
      "ui.exit": "Exit",
    },
    zh_cn: {
      "ui.pondering": "思索……",
      "ui.pondering_tag": "思索……",
      "ui.identify_mode": "显示方块名称已启用\n按 [%1$s] 继续思索",
      "ui.associated": "关联词条",
      "ui.close": "思索结束",
      "ui.identify": "显示方块名称",
      "ui.next": "下一个情景",
      "ui.next_up": "接下来：",
      "ui.previous": "上一个情景",
      "ui.replay": "重放",
      "ui.think_back": "回想",
      "ui.slow_text": "舒适阅读",
      "ui.exit": "退出",
    },
  };

  // The client language as Ore UI reports it, e.g. "zh-CN" -> "zh_cn".
  P.language = function () {
    const raw = (document.documentElement.lang || navigator.language || "en_us").toLowerCase();
    return raw.replace("-", "_");
  };
  const table = () => LANG[P.language()] || (P.language().indexOf("zh") === 0 ? LANG.zh_cn : LANG.en_us);

  P.translate = function (key) {
    const args = Array.prototype.slice.call(arguments, 1);
    const text = table()[key] || LANG.en_us[key] || key;
    return text.replace(/%(\d)\$s/g, (m, i) => String(args[i - 1]));
  };
  // Scene and tag text: either a string or { en_us: ..., zh_cn: ... }.
  P.localized = function (text) {
    if (text == null || typeof text === "string") return text || "";
    return text[P.language()] || (P.language().indexOf("zh") === 0 && text.zh_cn) || text.en_us || "";
  };
})();
