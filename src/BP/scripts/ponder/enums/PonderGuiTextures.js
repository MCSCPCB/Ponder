/**
 * 世界图标实体 ponder:icon 可显示的贴图，下标即实体属性 ponder:icon 的值。
 * 与 RP/entity/ponder_icon.entity.json 的 textures（icon0..）和
 * RP/render_controllers/ponder.render_controllers.json 的 array.icons 一一对应，
 * 增删贴图时三处必须同步修改。
 */
export const ICON_PATHS = Object.freeze([
  "textures/ui/ponder/logo",
  "textures/ui/ponder/pointer",
  "textures/ui/ponder/icon_use",
  "textures/ui/ponder/icon_attack",
  "textures/ui/ponder/icon_scroll",
]);

/** 找不到的路径回退到第 0 项，而不是让整个标注失败。 */
export const iconIndex = path => Math.max(0, ICON_PATHS.indexOf(path));
