export const UI_TEXT = {
  en_US: {
    ponder: "Pondering about", items: "Item index", tags: "Topic index", back: "Back",
    previous: "Previous scene", next: "Next scene", close: "Close", replay: "Replay",
    pause: "Pause tutorial", play: "Continue tutorial", comfy: "Comfortable reading",
    comfyOn: "Comfortable reading: on", nextUp: "Up next", done: "Scene complete",
    pagePrevious: "Previous page", pageNext: "Next page", step: "Jump to keyframe",
    loading: "Preparing a safe demonstration area…", busy: "Ponder is at capacity. Please try again later.",
    failed: "Ponder could not start safely. Your controls have been restored.",
    noSpace: "No empty demonstration area was found in this dimension. Nothing was overwritten.",
    recovering: "Ponder is recovering a previous session. Please try again shortly.",
    unavailable: "This environment does not expose the required ticking-area API.",
    error: "Ponder stopped after an error; restoring your controls.",
    resourceLimit: "Ponder stopped because the demonstration produced too many native entities.",
    use: "Use", attack: "Attack", scroll: "Scroll", slot: "Select slot", touch: "Tap",
    input: "Input", output: "Output", native: "Only the tutorial is paused; world simulation continues.",
    gamepad: "Controller", page: "Page", scenes: "Scenes", empty: "No scenes", hint: "Select a button · Back / Esc to close",
  },
  zh_CN: {
    ponder: "正在思索", items: "物品索引", tags: "主题索引", back: "返回",
    previous: "上一个场景", next: "下一个场景", close: "关闭", replay: "重播",
    pause: "暂停教学", play: "继续教学", comfy: "舒适阅读", comfyOn: "舒适阅读：开启",
    nextUp: "接下来", done: "场景已完成", pagePrevious: "上一页", pageNext: "下一页",
    step: "跳转到关键帧", loading: "正在准备安全的展示区……",
    busy: "思索展示区或常加载容量不足，请稍后重试。",
    failed: "未能安全启动思索，已恢复你的操作。",
    noSpace: "在当前维度未找到安全空置展示区，没有覆盖任何已有方块。",
    recovering: "正在恢复上次思索会话，请稍后重试。",
    unavailable: "当前环境未提供所需的常加载区接口。",
    error: "思索遇到异常，正在恢复你的操作。",
    resourceLimit: "展示区产生的原生副产物过多，思索已停止并恢复操作。",
    use: "使用", attack: "攻击", scroll: "滚动", slot: "选择槽位", touch: "轻触",
    input: "输入", output: "输出", native: "仅暂停教学时间轴，世界模拟仍继续。",
    gamepad: "手柄", page: "页", scenes: "场景", empty: "暂无场景", hint: "点击按钮操作 · 返回 / Esc 关闭",
  },
};
export const localeFor = player => {
  try { return player.clientSystemInfo.locale?.startsWith("zh") ? "zh_CN" : "en_US"; }
  catch { return "en_US"; }
};
/** Text can be a literal, {en_US,zh_CN}, or {key,with}. Entity glyphs resolve per session. */
export function localize(value, locale = "en_US") {
  if (typeof value === "string") return value;
  if (!value) return "";
  if (value.key) {
    let text = UI_TEXT[locale]?.[value.key] ?? UI_TEXT.en_US[value.key] ?? value.key;
    for (const [i, arg] of (value.with ?? []).entries()) text = text.replace(`{${i}}`, String(arg));
    return text;
  }
  return value[locale] ?? value.en_US ?? value.zh_CN ?? "";
}
export const tr = (key, locale = "en_US") => localize({ key }, locale);
export const bilingual = (zh_CN, en_US) => ({ zh_CN, en_US });
