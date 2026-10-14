import { LIMITS } from "../../enums/PonderConfig.js";
import { layoutAnnotations } from "./OverlayLayout.js";
import { add, length, sub } from "../VecHelper.js";
import { packGlyph, themeColor } from "./TextWindowElement.js";
import { ICON_PATHS } from "../../enums/PonderGuiTextures.js";
import { markOwned } from "../level/StageOwnership.js";
import { safeRemove } from "../level/StageJobs.js";

const directionIndex = { right: 0, bottom: 1, left: 2, top: 3 };
const actionIcons = { use: "use", attack: "attack", scroll: "scroll", slot: "slot" };
export class OverlayRenderer {
  constructor(session, scene) { this.session = session; this.scene = scene; this.entities = new Map(); }
  render(state, tracked) {
    const layout = layoutAnnotations(this.scene, state, this.session.locale, this.session.inputMode, tracked);
    const desired = new Map();
    const addEntity = (id, type, position, properties) => desired.set(id, { type, position, properties });
    const line = (id, from, to, color, alpha = 1, through = true, width = .022) => {
      const delta = sub(to, from), size = length(delta);
      if (size < .001) return;
      addEntity(id, "line", from, {
        length: size, width, color: themeColor(color), alpha, through,
        pitch: -Math.asin(delta.y / size) * 180 / Math.PI,
        yaw: -Math.atan2(delta.x, delta.z) * 180 / Math.PI,
      });
    };
    for (const { annotation, edges, alpha = .95 } of layout.outlines) {
      edges.forEach(([a, b], i) => line(`${annotation.id}:edge:${i}`, a, b, annotation.color, alpha,
        annotation.through !== false, annotation.width ?? .028));
    }
    for (const panel of layout.panels) {
      const { annotation: a, rect, text, alpha, color } = panel;
      const common = { color, alpha, through: a.through !== false };
      addEntity(`${a.id}:frame`, "frame", panel.center, { ...common, width: rect.w, height: rect.h });
      const groups = new Map();
      for (const glyph of text.glyphs) {
        if (!groups.has(glyph.color)) groups.set(glyph.color, []);
        groups.get(glyph.color).push(glyph);
      }
      for (const [glyphColor, glyphs] of groups) {
        for (let start = 0; start < glyphs.length; start += 8) {
          const properties = { ...common, color: glyphColor, scale: this.scene.textScale };
          for (let slot = 0; slot < 8; slot++) {
            const glyph = glyphs[start + slot];
            properties[`g${slot}`] = glyph ? packGlyph(glyph) : -1;
            properties[`p${slot}`] = glyph ? glyph.x + glyph.y * 512 : 0;
          }
          addEntity(`${a.id}:text:${glyphColor}:${start / 8}`, "text", panel.textOrigin, properties);
        }
      }
      for (let i = 0; i < panel.line.length - 1; i++)
        line(`${a.id}:pointer:${i}`, panel.line[i], panel.line[i + 1], color, alpha, a.through !== false);
      if (a.op === "controls") {
        const x = rect.x + 14 * this.scene.textScale, y = rect.y + rect.h / 2;
        const iconPath = a.iconPath ?? `textures/ui/ponder/icon_${this.session.inputMode === "touch" ? "touch" : actionIcons[a.action] ?? "use"}`;
        const texture = Math.max(0, ICON_PATHS.indexOf(iconPath));
        addEntity(`${a.id}:icon`, "icon", layout.view.point(x, y, .04),
          { ...common, color: 0xffffff, icon: texture, size: 16 * this.scene.textScale, angle: 0 });
        addEntity(`${a.id}:tip`, "icon", layout.view.point(
          panel.side === "left" ? rect.x + rect.w : panel.side === "right" ? rect.x : rect.x + rect.w / 2,
          panel.side === "top" ? rect.y : panel.side === "bottom" ? rect.y + rect.h : rect.y + rect.h / 2, .045),
        { ...common, icon: ICON_PATHS.indexOf("textures/ui/ponder/pointer"), size: .24,
          angle: (directionIndex[panel.side] ?? 0) * 90 });
      }
    }
    if (desired.size > LIMITS.entities) throw new Error(`Annotation entity budget exceeded (${desired.size}/${LIMITS.entities})`);
    for (const [id, record] of this.entities)
      if (!desired.has(id)) { safeRemove(record.entity); this.entities.delete(id); }
    for (const [id, descriptor] of desired) {
      let record = this.entities.get(id);
      const position = add(descriptor.position, this.session.lease.origin);
      if (!record?.entity.isValid) {
        const entity = markOwned(this.session.dimension.spawnEntity(`ponder:${descriptor.type}`, position), this.session.lease);
        record = { entity, position, values: {} };
        this.entities.set(id, record);
      }
      if (length(sub(position, record.position)) > .0001) {
        record.entity.teleport(position);
        record.position = position;
      }
      for (const [property, value] of Object.entries(descriptor.properties)) {
        if (record.values[property] === value) continue;
        record.entity.setProperty(`ponder:${property}`, value);
        record.values[property] = value;
      }
    }
    return layout;
  }
  dispose() {
    for (const record of this.entities.values()) safeRemove(record.entity);
    this.entities.clear();
  }
}
