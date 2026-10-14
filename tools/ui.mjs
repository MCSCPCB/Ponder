import { ACTIVE, DISABLED, HIDDEN, LIMITS, SLOTS, TITLE_MARKER } from "../src/BP/scripts/ponder/constants.js";
import { registry } from "../src/BP/scripts/ponder/registry.js";
import { progressSchedule } from "../src/BP/scripts/ponder/core/ui-progress.js";
import { json, write } from "./files.mjs";

const ns = "ponder";
const ref = name => `@${ns}.${name}`;
const control = (name, value) => ({ [name]: value });
const use = (name, template, value = {}) => control(`${name}${ref(template)}`, value);
const texture = name => `textures/ui/ponder/${name}`;
const col = (name, target = name) => ({
  binding_type: "collection", binding_collection_name: "form_buttons",
  binding_name: name, binding_name_override: target,
});
const details = { binding_type: "collection_details", binding_collection_name: "form_buttons" };
const view = (expression, target, source) => ({
  binding_type: "view", ...(source ? { source_control_name: source } : {}),
  source_property_name: expression, target_property_name: target,
});
const contains = (field, text) => `(not ((${field} - '${text}') = ${field}))`;
const titleVisible = expression => [{ binding_name: "#title_text" }, view(expression, "#visible")];
const isPonder = contains("#title_text", TITLE_MARKER);
const isScene = contains("#title_text", "|scene|");
const isIndex = `(not ${isScene})`;
const cleanText = `(#raw - '${ACTIVE}' - '${DISABLED}')`;
const boundText = (source, extra = {}) => ({
  type: "label", text: "#text", color: [238 / 255, 238 / 255, 238 / 255],
  shadow: true, size: ["default", "default"],
  bindings: source ? [view("#raw", "#text", source)] : [col("#form_button_text", "#raw"), view(cleanText, "#text")],
  ...extra,
});
const icon = size => ({
  type: "image", size: [size, size], texture: "#texture", texture_file_system: "#texture_file_system",
  bindings: [col("#form_button_texture", "#texture"), col("#form_button_texture_file_system", "#texture_file_system")],
});
const payload = (name, index) => control(name, {
  type: "panel", size: [0, 0], collection_index: index,
  bindings: [details, col("#form_button_text", "#raw"), col("#form_button_texture", "#texture"),
    col("#form_button_texture_file_system", "#texture_file_system")],
});

export function generateUI() {
  const ui = { namespace: ns };
  ui.fade_in = { anim_type: "alpha", easing: "linear", duration: .15, from: 0, to: 1 };
  ui.fade_out = { anim_type: "alpha", easing: "linear", duration: .1, from: 1, to: 0,
    play_event: "screen.exit_pop", end_event: "screen.exit_end" };
  ui.title_flip = { anim_type: "size", easing: "out_cubic", duration: .22, from: [32, 1], to: [32, 32] };
  ui.hover_in = { anim_type: "alpha", easing: "linear", duration: .1, from: .6, to: 1 };
  ui.pulse_up = { anim_type: "alpha", easing: "in_out_sine", duration: .65, from: .25, to: .85, next: ref("pulse_down") };
  ui.pulse_down = { anim_type: "alpha", easing: "in_out_sine", duration: .65, from: .85, to: .25, next: ref("pulse_up") };
  ui.finished_reveal = { anim_type: "alpha", easing: "linear", duration: .25, from: 0, to: 1 };

  ui.button_state = {
    type: "panel", size: ["100%", "100%"], "$background|default": texture("button_bg_default"),
    controls: [
      control("background", { type: "image", size: ["100%", "100%"], texture: "$background" }),
      control("icon", { ...icon(16), layer: 2 }),
    ],
  };
  ui.button_hover = {
    type: "panel", size: ["100%", "100%"], alpha: ref("hover_in"), propagate_alpha: true,
    controls: [
      use("visual", "button_state", { $background: "$hover_background" }),
      control("tooltip", {
        type: "panel", size: ["100%cm + 22px", 18], max_size: [236, 18],
        offset: "$tooltip_offset", anchor_from: "$tip_from", anchor_to: "$tip_to", layer: 40,
        controls: [
          control("background", { type: "image", texture: texture("tooltip_streak"), size: ["100%", "100%"] }),
          control("text", boundText(null, { max_size: [210, 18], text_alignment: "center", font_scale_factor: .85 })),
        ],
      }),
    ],
  };
  ui.button = {
    type: "button", size: [28, 28], focus_enabled: true,
    "$tooltip_offset|default": [0, 21],
    "$tip_from|default": "center", "$tip_to|default": "center",
    "$default_background|default": texture("button_bg_default"),
    "$hover_background|default": texture("button_bg_hover"),
    "$pressed_background|default": texture("button_bg_pressed"),
    "$disabled_background|default": texture("button_bg_disabled"),
    "$pressed_button_name": "button.form_button_click",
    default_control: "default", hover_control: "hover", pressed_control: "pressed", locked_control: "locked",
    sound_name: "random.click",
    button_mappings: [
      { from_button_id: "button.menu_select", to_button_id: "$pressed_button_name", mapping_type: "pressed" },
      { from_button_id: "button.menu_ok", to_button_id: "$pressed_button_name", mapping_type: "focused" },
    ],
    bindings: [details, col("#form_button_text", "#raw"),
      view(`(not ${contains("#raw", HIDDEN)})`, "#visible"),
      view(`(not ${contains("#raw", DISABLED)})`, "#enabled")],
    controls: [
      use("default", "button_state", { $background: "$default_background" }),
      use("hover", "button_hover"),
      use("pressed", "button_state", { $background: "$pressed_background" }),
      use("locked", "button_state", { $background: "$disabled_background" }),
      control("active", {
        type: "image", texture: texture("button_bg_hover"), size: [28, 28], layer: 1,
        alpha: ref("pulse_up"),
        bindings: [col("#form_button_text", "#raw"), view(contains("#raw", ACTIVE), "#visible")],
      }),
    ],
  };
  ui["side_button@ponder.button"] = {
    $default_background: texture("side_button_bg_default"), $hover_background: texture("side_button_bg_hover"),
    $pressed_background: texture("side_button_bg_pressed"), $disabled_background: texture("side_button_bg_disabled"),
    $tip_from: "right_middle", $tip_to: "left_middle", $tooltip_offset: [2, 0],
  };
  ui.card_state = {
    type: "panel", size: ["100%", "100%"], "$background|default": texture("button_bg_default"),
    controls: [
      control("background", { type: "image", texture: "$background", size: ["100%", "100%"] }),
      control("icon", { ...icon(24), anchor_from: "left_middle", anchor_to: "left_middle", offset: [7, 0] }),
      control("text", boundText(null, { size: ["100% - 44px", "100% - 6px"],
        anchor_from: "right_middle", anchor_to: "right_middle", offset: [-4, 0],
        font_scale_factor: .85, text_alignment: "left" })),
    ],
  };
  ui["card@ponder.button"] = {
    size: ["50% - 3px", 44],
    controls: [
      use("default", "card_state"),
      use("hover", "card_state", { $background: texture("button_bg_hover") }),
      use("pressed", "card_state", { $background: texture("button_bg_pressed") }),
      use("locked", "card_state", { $background: texture("button_bg_disabled") }),
    ],
  };
  ui.header = {
    type: "panel", size: [250, 46], anchor_from: "top_left", anchor_to: "top_left", offset: [18, 14],
    controls: [
      control("frame", { type: "image", texture: texture("header_icon_frame"), size: [38, 38],
        anchor_from: "top_left", anchor_to: "top_left" }),
      control("icon", {
        type: "image", size: ref("title_flip"), anchor_from: "top_left", anchor_to: "top_left", offset: [3, 3],
        texture: "#texture", texture_file_system: "#texture_file_system",
        bindings: [view("#texture", "#texture", "ponder_header"), view("#texture_file_system", "#texture_file_system", "ponder_header")],
      }),
      control("title", {
        type: "panel",
        anchor_from: "top_left", anchor_to: "top_left", offset: [41, 10], size: ["100%cm", "100%cm"],
        max_size: [180, 50], layer: 2,
        controls: [
          control("labels", {
            type: "stack_panel", orientation: "vertical", size: ["100%cm", "100%c"], max_size: [180, 50],
            controls: [
              control("subtitle", { type: "panel", size: ["100%cm", 14],
                controls: [["scene", "ponder.ui.ponder", isScene], ["index", "ponder.ui.index", isIndex]]
                  .map(([name, text, expression]) => control(name, {
                    type: "label", text, color: [163 / 255, 163 / 255, 163 / 255],
                    shadow: true, size: ["default", 14], font_scale_factor: .85,
                    anchor_from: "top_left", anchor_to: "top_left", bindings: titleVisible(expression),
                  })) }),
              control("text", boundText("ponder_header", { max_size: [180, 36],
                text_alignment: "left", anchor_from: "top_left", anchor_to: "top_left" })),
            ],
          }),
          control("streak", { type: "image", texture: texture("header_streak_thick"), size: ["100% + 30px", "100% + 8px"],
            anchor_from: "center", anchor_to: "center", layer: -1 }),
        ],
      }),
    ],
  };

  // The root contains one global collection. Fixed indices match core/form.js.
  const children = [
    payload("ponder_header", SLOTS.header), payload("ponder_next", SLOTS.nextUp),
    use("header", "header"),
    control("input_hint", { type: "label", text: "ponder.ui.input_hint", size: ["default", 9],
      color: [.64, .64, .64], font_scale_factor: .75,
      anchor_from: "bottom_middle", anchor_to: "bottom_middle", offset: [0, -2] }),
    control("body", { type: "label", text: "#form_text", bindings: [{ binding_name: "#form_text" }],
      color: [.64, .64, .64], size: ["100% - 70px", 8], font_scale_factor: .7,
      anchor_from: "bottom_middle", anchor_to: "bottom_middle", offset: [0, -12] }),
  ];
  for (const [name, slot, x] of [
    ["previous", SLOTS.previous, -28], ["close", SLOTS.close, 0], ["next", SLOTS.next, 28],
    ["replay", SLOTS.replay, -70], ["play", SLOTS.play, 70], ["comfy", SLOTS.comfy, 106], ["back", SLOTS.back, -106],
  ]) children.push(use(name, "button", {
    collection_index: slot, anchor_from: "bottom_middle", anchor_to: "center",
    offset: [x, -49], $tooltip_offset: [-x, -24], layer: 10,
  }));
  for (const [name, slot, x] of [["items", SLOTS.items, -54], ["tags", SLOTS.tags, -20]])
    children.push(use(name, "button", {
      collection_index: slot, anchor_from: "top_right", anchor_to: "center", offset: [x, 33],
      $tooltip_offset: [-32, 23], layer: 15,
    }));
  for (const [name, x, flip] of [["left_arrow", -44, true], ["right_arrow", 44, false]])
    children.push(control(name, { type: "image", size: [44, 30], texture: texture("pointer"),
      alpha: .12, flip_x: flip, offset: [x, -49], anchor_from: "bottom_middle", anchor_to: "center", layer: -1,
      bindings: titleVisible(isScene) }));

  ui.sidebar_content = {
    type: "stack_panel", orientation: "vertical", size: ["100%", "100%c"],
    controls: Array.from({ length: LIMITS.sidebar }, (_, i) => control(`row${i}`, {
      type: "panel", size: ["100%", 30],
      controls: [use("tag", "side_button", {
        collection_index: SLOTS.sidebar + i, anchor_from: "left_middle", anchor_to: "left_middle",
      })],
    })),
  };
  children.push(control("sidebar@common.scrolling_panel", {
    // The hover tooltip belongs to the clipped scrolling subtree. Reserve its
    // full right-expanded width, not just the 28px visible button column.
    anchor_from: "top_left", anchor_to: "top_left", offset: [18, 62], size: [270, "100% - 138px"],
    max_size: ["100% - 36px", "100%"],
    $show_background: false, $scrolling_content: "ponder.sidebar_content",
    $scroll_size: [2, "100%"], $scrolling_pane_size: ["100% - 3px", "100%"],
    $scrolling_pane_offset: [0, 0], $scroll_bar_right_padding_size: [0, 0],
    bindings: titleVisible(isScene),
  }));
  ui.index_content = {
    type: "stack_panel", orientation: "vertical", size: ["100%", "100%c"],
    controls: Array.from({ length: 4 }, (_, row) => control(`row${row}`, {
      type: "panel", size: ["100%", 48],
      controls: [0, 1].map(column => use(`card${column}`, "card", {
        collection_index: SLOTS.cards + row * 2 + column,
        anchor_from: column ? "right_middle" : "left_middle", anchor_to: column ? "right_middle" : "left_middle",
      })),
    })),
  };
  children.push(control("index@common.scrolling_panel", {
    anchor_from: "top_middle", anchor_to: "top_middle", offset: [0, 65],
    size: ["100% - 40px", "100% - 140px"], max_size: [410, "100%"],
    $show_background: false, $scrolling_content: "ponder.index_content",
    $scroll_size: [4, "100%"], $scrolling_pane_size: ["100% - 6px", "100%"],
    $scrolling_pane_offset: [0, 0], $scroll_bar_right_padding_size: [0, 0],
    bindings: titleVisible(isIndex),
  }));
  for (const [name, slot, x] of [["page_previous", SLOTS.pagePrevious, -28], ["page_next", SLOTS.pageNext, 28]])
    children.push(use(name, "button", { collection_index: slot, offset: [x, -49],
      anchor_from: "bottom_middle", anchor_to: "center", $tooltip_offset: [-x, -24], layer: 11 }));

  ui.keyframe_state = {
    type: "panel", size: ["100%", "100%"], "$marker_height|default": 5, "$marker_alpha|default": .45,
    controls: [control("marker", { type: "image", size: [2, "$marker_height"],
      texture: texture("white"), alpha: "$marker_alpha" })],
  };
  ui.keyframe_hover = {
    type: "panel", size: ["100%", "100%"],
    controls: [
      use("marker", "keyframe_state", { $marker_height: 13, $marker_alpha: 1 }),
      control("line", { type: "image", texture: texture("white"), size: [1, 10], offset: [0, -12], alpha: .7 }),
      control("arrow", { type: "image", texture: texture("pointer"), size: [7, 7], offset: [-4, -18], alpha: .9 }),
      control("tooltip", boundText(null, { max_size: [210, 18], offset: ["$tip_x", -40],
        text_alignment: "center", font_scale_factor: .85, layer: 40 })),
    ],
  };
  ui["keyframe@ponder.button"] = {
    size: [6, 15], "$tip_x|default": 0,
    controls: [
      use("default", "keyframe_state"), use("hover", "keyframe_hover"),
      use("pressed", "keyframe_state", { $marker_height: 15, $marker_alpha: 1 }),
    ],
  };
  const barChildren = [control("track", { type: "image", texture: texture("progress_track"), size: [228, 9], layer: 0 })];

  ui.completion = {
    type: "panel", size: [228, 9], propagate_alpha: true, layer: 12,
    controls: [
      control("next_pulse", { type: "image", size: [28, 28], texture: texture("button_bg_hover"),
        offset: [28, -22.5], alpha: ref("pulse_up"),
        bindings: [col("#form_button_text", "#raw"), view(`(not ${contains("#raw", DISABLED)})`, "#visible")],
        collection_index: SLOTS.next }),
      control("hint", {
        type: "panel", size: ["100%cm + 20px", "100%cm + 12px"], max_size: [218, 45], offset: [0, -76],
        controls: [
          control("background", { type: "image", texture: texture("text_bubble_frame"), size: ["100%", "100%"] }),
          control("text", boundText("ponder_next", { max_size: [190, 30], text_alignment: "center", layer: 1, font_scale_factor: .9 })),
        ],
      }),
    ],
  };
  // A finite preset is chosen by exact string comparison. All native animation
  // durations are constants, and preset suffixes share one animation chain.
  for (const scene of registry.scenes) {
    const sceneToken = contains("#title_text", `|${scene.id}|`);
    barChildren.push(control(`keys_${scene.id}`, {
      type: "panel", size: [224, 9], layer: 20, bindings: titleVisible(sceneToken),
      controls: scene.timeline.keyframes.map((frame, i) => {
        const x = frame.tick / scene.timeline.duration * 224 - 112;
        return use(`key${i}`, "keyframe", { collection_index: SLOTS.keyframes + i, offset: [x, 0], $tip_x: -x });
      }),
    }));
    for (const comfy of [false, true]) {
      const schedule = progressSchedule(scene, comfy);
      const stem = `${scene.id}_${Number(comfy)}`;
      for (const entry of schedule.slice(0, -1)) {
        const { pixel, seconds, remaining } = entry;
        const anim = `progress_${stem}_${pixel}`;
        ui[anim] = { anim_type: "size", easing: "linear", duration: Math.max(.001, seconds),
          from: [pixel, 3], to: [pixel + 1, 3],
          ...(pixel < 223 ? { next: ref(`progress_${stem}_${pixel + 1}`) } : {}) };
        const wait = `finish_${stem}_${pixel}`;
        // An alpha animation holding 0 avoids wait animations displaying alpha=1.
        ui[wait] = { anim_type: "alpha", easing: "linear", duration: Math.max(.001, remaining),
          from: 0, to: 0, next: ref("finished_reveal") };
        barChildren.push(control(`run_${stem}_${pixel}`, {
          type: "panel", size: [224, 9],
          bindings: titleVisible(contains("#title_text", `|${scene.id}:run:${Number(comfy)}:${pixel}|`)),
          controls: [
            control("fill", { type: "image", texture: texture("progress_fill"),
              size: ref(anim), anchor_from: "left_middle", anchor_to: "left_middle", layer: 1 }),
            use("complete", "completion", { alpha: ref(wait) }),
          ],
        }));
      }
    }
  }
  // Held progress shares 225 controls across every scene and both reading modes.
  for (let pixel = 0; pixel <= 224; pixel++) barChildren.push(control(`hold_${pixel}`, {
    type: "image", texture: texture("progress_fill"), size: [pixel, 3], layer: 1,
    anchor_from: "left_middle", anchor_to: "left_middle", offset: [2, 0],
    bindings: titleVisible(`(${contains("#title_text", ":hold:")} and ${contains("#title_text", `:${pixel}|`)})`),
  }));
  barChildren.push(use("finished", "completion", { bindings: titleVisible(contains("#title_text", "|done|")) }));
  children.push(control("progress", {
    type: "panel", size: [228, 9], anchor_from: "bottom_middle", anchor_to: "center",
    offset: [0, -26.5], bindings: titleVisible(isScene), controls: barChildren,
  }));
  ui.root = {
    type: "panel", size: ["100%", "100%"], collection_name: "form_buttons",
    layer: 10, alpha: ref("fade_in"), anims: [ref("fade_out")], propagate_alpha: true,
    bindings: titleVisible(isPonder), controls: children,
  };
  // Separate namespace, small vanilla patch: ordinary action/modal/message forms
  // retain their native factories, title bindings and behaviour.
  const vanilla = { namespace: "server_form",
    "third_party_server_screen@common.base_screen": {
      $screen_content: "server_form.main_screen_content",
      $additional_screen_content: "ponder.root",
      $screen_bg_content: "ponder.compatible_background",
      force_render_below: true, render_game_behind: true, load_screen_immediately: true,
      button_mappings: [{ from_button_id: "button.menu_cancel", to_button_id: "button.menu_exit", mapping_type: "global" }],
    },
  };
  for (const name of ["main_screen_content", "main_screen_content/server_form_factory", "long_form", "custom_form"])
    vanilla[name] = { bindings: titleVisible(`(not ${isPonder})`) };
  ui["compatible_background@common.screen_background"] = { bindings: titleVisible(`(not ${isPonder})`) };
  json("src/RP/ui/server_form.json", vanilla);
  // Compact generated output avoids tens of thousands of low-information lines.
  json("src/RP/ui/ponder.generated.json", ui, true);
  json("src/RP/ui/_ui_defs.json", { ui_defs: ["ui/ponder.generated.json", "ui/server_form.json"] });
  json("src/RP/texts/languages.json", ["en_US", "zh_CN"]);
  write("src/RP/texts/en_US.lang", "ponder.ui.ponder=Pondering about\nponder.ui.index=Explore tutorials\nponder.ui.input_hint=Click / tap a button · Back to close\n");
  write("src/RP/texts/zh_CN.lang", "ponder.ui.ponder=正在思索\nponder.ui.index=思索索引\nponder.ui.input_hint=点击按钮操作 · 返回键关闭\n");
  return { definitions: Object.keys(ui).length, runPresets: registry.scenes.length * 448 };
}
