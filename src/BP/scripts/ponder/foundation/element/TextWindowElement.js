import { system, TextPrimitive, world } from "@minecraft/server";
import { GUI_SCREEN_H, LINE_ENTITY, WINDOW_ENTITY } from "../../enums/PonderConfig.js";
import { add, distance, orbit } from "../VecHelper.js";
import { markOwned } from "../level/StageOwnership.js";

/**
 * Java's TextWindowElement, drawn on a plane just in front of the camera so it reads as
 * screen UI: a box (overlay entities) with the text (a TextPrimitive) and, with `pointAt`,
 * a horizontal line from the target to the box. Positions follow TextWindowElement.render,
 * in Java GUI pixels on a 16:9 screen whose height is the camera's vertical view.
 */

// Java GUI screen this layout is computed on, 16:9. The script cannot read the player's
// real screen.
const SCREEN_H = GUI_SCREEN_H, SCREEN_W = SCREEN_H * 16 / 9;
// The plane sits this far in front of the camera; it only has to be nearer than the scene.
const PLANE_DISTANCE = 2;
// Each layer is nudged towards the camera so later ones draw over earlier ones.
const LAYER_STEP = 0.002;
const FADE_TICKS = 5;
// PonderPalette.WHITE mixed half with 0xffffdd, as Java's `brighter`. The window and line
// colours live in their textures (textures/special/ponder/text_window, text_line).
const TEXT_COLOR = { red: (0xee + 0xff) / 2 / 255, green: (0xee + 0xff) / 2 / 255, blue: (0xee + 0xdd) / 2 / 255, alpha: 1 };
// Java font units: 9 per line and per CJK glyph cell.
const LINE_HEIGHT = 9;
const PUNCTUATION = "，。、；：！？（）《》「」『』“”‘’";
const CLOSING = "，。、；：！？）》」』”’";
// CJK and full-width characters: a line may break before any of them.
const isWide = ch => ch.codePointAt(0) > 0x2e80;
// Java's advances, which decide where Java breaks a line: a CJK cell 9, a space 4, else 6.
const javaWidth = ch => (isWide(ch) ? 9 : ch === " " ? 4 : 6);
// What a TextPrimitive actually draws, in the same units (calibrated in game): full-width
// punctuation 3, a CJK glyph 8. The box hugs and the line is placed by these.
const glyphWidth = ch => (PUNCTUATION.includes(ch) ? 3 : isWide(ch) ? 8 : ch === " " ? 4 : 6);
// Width in blocks of a CJK glyph of a TextPrimitive at scale 1 (calibrated in game).
const TEXT_PRIMITIVE_GLYPH = 0.25;
// A single-line TextPrimitive is centred on its location horizontally but draws about this
// many font units below it (seen in game: a line centred in its box sat on the box's bottom
// edge), so each line stands this much higher.
const TEXT_RAISE = 4.5;
const textWidth = line => [...line].reduce((n, c) => n + glyphWidth(c), 0);
const javaTextWidth = line => [...line].reduce((n, c) => n + javaWidth(c), 0);

/** Splits like Java's splitter, by Java's advances: on spaces for Latin text, anywhere for CJK. */
function wrap(text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    let line = "", width = 0, lastSpace = -1;
    for (const ch of paragraph) {
      const w = javaWidth(ch);
      // Closing punctuation never starts a line; it stays at the end of the one before.
      if (width + w > maxWidth && line.length && !CLOSING.includes(ch)) {
        // A CJK glyph may start a line anywhere; a Latin word goes back to its space.
        if (ch !== " " && !isWide(ch) && lastSpace > 0) {
          lines.push(line.slice(0, lastSpace));
          line = line.slice(lastSpace + 1);
        } else {
          lines.push(line);
          line = "";
        }
        width = javaTextWidth(line);
        lastSpace = -1;
        if (ch === " ") continue;
      }
      if (ch === " ") lastSpace = line.length;
      line += ch;
      width += w;
    }
    lines.push(line);
  }
  return lines;
}

/** The camera plane: maps a world point to Java screen pixels, and screen pixels back. */
function projection(camera, origin) {
  const pose = orbit(camera);
  const eye = add(pose.location, origin), focus = add(camera.focus, origin);
  const len = Math.hypot(focus.x - eye.x, focus.y - eye.y, focus.z - eye.z);
  const forward = { x: (focus.x - eye.x) / len, y: (focus.y - eye.y) / len, z: (focus.z - eye.z) / len };
  const up = pose.up;
  // right = forward × up
  const right = {
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  };
  const tan = Math.tan(camera.fov * Math.PI / 360);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  return {
    forward, right, up,
    yaw: Math.atan2(-forward.x, forward.z) * 180 / Math.PI,
    pitch: -Math.asin(forward.y) * 180 / Math.PI,
    /** World point to Java screen pixels (y grows downwards). */
    toScreen(point) {
      const v = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z };
      const depth = dot(v, forward);
      const sx = dot(v, right) / (depth * tan), sy = dot(v, up) / (depth * tan);
      return { x: SCREEN_W / 2 + sx * SCREEN_H / 2, y: SCREEN_H / 2 - sy * SCREEN_H / 2 };
    },
    /** Screen pixels to a world point on the plane, `layer` steps nearer the camera. */
    toWorld(x, y, layer = 0) {
      const d = PLANE_DISTANCE - layer * LAYER_STEP, unit = 2 * d * tan / SCREEN_H;
      const sx = (x - SCREEN_W / 2) * unit, sy = (SCREEN_H / 2 - y) * unit;
      return {
        x: eye.x + forward.x * d + right.x * sx + up.x * sy,
        y: eye.y + forward.y * d + right.y * sx + up.y * sy,
        z: eye.z + forward.z * d + right.z * sx + up.z * sy,
      };
    },
    /** World length of one screen pixel on the plane, `layer` steps nearer the camera. */
    pixel(layer = 0) { return 2 * (PLANE_DISTANCE - layer * LAYER_STEP) * tan / SCREEN_H; },
  };
}

/** TextWindowElement.render's layout, in Java GUI pixels. */
function layoutWindow(stage, view, origin) {
  const target = stage.pointAt && view.toScreen(add(stage.pointAt, origin));
  const sy = target ? target.y : (SCREEN_H - 200) / 2 + stage.y - 8;
  const yDiff = (SCREEN_H / 2 - sy - 10) / 100;
  let targetX = SCREEN_W * (6 / 8 + (5 / 8 - 6 / 8) * yDiff * yDiff);
  if (stage.placeNearTarget && target) targetX = Math.min(targetX, target.x + 50);
  // Java's `textWidth`: the widest a line may wrap to.
  const lines = wrap(stage.description, Math.min(SCREEN_W - targetX, 180));
  const boxWidth = Math.max(...lines.map(textWidth));
  const boxHeight = lines.length * LINE_HEIGHT;
  return { target, y: sy, targetX, lines, boxWidth, boxHeight };
}

/**
 * Java's BoxElement (borderOffset 2) around the text, and the line, in screen pixels. The
 * box's outer edge is 4 px outside its content, so the whole window is content + 8 px; the
 * window texture's 4 px nine-slice corners are exactly that border.
 */
function windowRects(layout) {
  const { y, targetX, boxWidth, boxHeight, target } = layout;
  const x = targetX - 10, top = y + 3, f = 2;
  const window = { x: x - f - 2, y: top - f - 2, w: boxWidth + 2 * f + 4, h: boxHeight - 1 + 2 * f + 4 };
  // The line runs from the target to targetX, 2 px tall, as Java's two fillGradient rows.
  const line = target && { x: target.x, y, w: Math.max(targetX - target.x, 0) };
  return { window, line };
}

export class TextWindowElement {
  constructor(session, stage) {
    this.session = session;
    this.stage = stage;
    this.window = undefined;
    this.line = undefined;
    this.texts = [];
    this.fade = 0;
    this.closed = false;
  }

  /** Spawns the window hidden and fades it in over FADE_TICKS, Java's fade * fade. */
  show() {
    const { lease, scene } = this.session;
    const view = projection(scene.camera, lease.origin);
    this.view = view;
    this.layout = layoutWindow(this.stage, view, lease.origin);
    const { window: box, line } = windowRects(this.layout);
    // The window stands at its top-left corner; its geometry hangs right and down from there.
    this.window = this.spawn(WINDOW_ENTITY, box.x, box.y, 0, { "ponder:width": box.w, "ponder:height": box.h });
    // The line stands at its left end, the target, and grows right with the fade.
    if (line) this.line = this.spawn(LINE_ENTITY, line.x, line.y, 1, { "ponder:width": line.w });
    this.applyFade(0);
    let tick = 0;
    this.run = system.runInterval(() => {
      if (this.closed) return;
      tick += 1;
      const t = Math.min(tick / FADE_TICKS, 1);
      this.applyFade(t * t);
      if (t >= 1) { system.clearRun(this.run); this.run = undefined; }
    }, 1);
  }

  /** One of the two window entities, facing the camera, at screen pixel (x, y). */
  spawn(type, x, y, layer, properties) {
    const { lease, dimension } = this.session;
    const entity = dimension.spawnEntity(type, this.view.toWorld(x, y, layer));
    markOwned(entity, lease);
    entity.setProperty("ponder:yaw", this.view.yaw);
    entity.setProperty("ponder:pitch", this.view.pitch);
    entity.setProperty("ponder:pixel", this.view.pixel(layer));
    for (const [key, value] of Object.entries(properties)) entity.setProperty(key, value);
    return entity;
  }

  /** Window and text alpha follow `fade`; the line also grows with it, as in Java. */
  applyFade(fade) {
    this.fade = fade;
    if (this.window?.isValid) this.window.setProperty("ponder:alpha", fade);
    if (this.line?.isValid) {
      this.line.setProperty("ponder:alpha", fade);
      this.line.setProperty("ponder:grow", fade);
    }
    // Seen in game: writing `color` on an added TextPrimitive reads back alpha 0 and the text
    // never shows, while one given its colour before being added does. So each fade step
    // adds new texts with that alpha and removes the previous ones.
    const previous = this.texts;
    this.texts = this.layout.lines.map((line, i) => this.createLine(line, i, fade));
    for (const text of this.texts) world.primitiveShapesManager.addText(text);
    for (const text of previous) world.primitiveShapesManager.removeText(text);
  }

  /**
   * Line `i` of the text, fully set up with the given alpha, not yet added. The API has no
   * text alignment and centres a TextPrimitive on its location, so the line stands at the
   * centre of where Java would draw it, from its estimated width; its left edge then lands
   * on targetX - 10. One text per line keeps the font's own baseline and spacing. Raised by
   * TEXT_RAISE to centre it in its line.
   */
  createLine(line, i, alpha) {
    const { view, layout, session } = this, { dimension, player } = session;
    const x = layout.targetX - 10 + textWidth(line) / 2;
    const y = layout.y + 3 + LINE_HEIGHT * i + LINE_HEIGHT / 2 - TEXT_RAISE;
    const text = new TextPrimitive({ dimension, ...view.toWorld(x, y, 3) }, line);
    text.useRotation = true;
    // Confirmed in game: the camera's pitch, with the yaw mirrored.
    text.rotation = { x: view.pitch, y: -view.yaw, z: 0 };
    text.depthTest = false;
    text.backfaceVisible = false;
    text.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0 };
    // A CJK glyph cell spans 9 screen pixels, Java's font at GUI scale.
    text.scale = view.pixel(3) * 9 / TEXT_PRIMITIVE_GLYPH;
    text.visibleTo = [player];
    // The default range is the client's render distance around the player, who stays where
    // they were while the camera is at the far stage; cover that distance.
    text.maximumRenderDistance = Math.ceil(distance(player.location, text.location)) + 64;
    text.color = { ...TEXT_COLOR, alpha };
    return text;
  }

  remove() {
    this.closed = true;
    if (this.run !== undefined) system.clearRun(this.run);
    for (const entity of [this.window, this.line]) if (entity?.isValid) entity.remove();
    this.window = this.line = undefined;
    for (const text of this.texts) world.primitiveShapesManager.removeText(text);
    this.texts = [];
  }
}
