# Ponder

## 开发者手册

这份手册只说明当前项目已经存在的这套链路怎么扩展，不讲泛用 JSON UI 基础。

### 先记住这几件事

- 思索入口已经接在 `world.afterEvents.itemUse` 上，触发代码在 `src/BP/scripts/index.js`。
- 一个思索要真正生效，只需要两件事：它被加进 `PONDER_SCENES`，并且玩家手里使用的物品命中了 `entryItems`。
- `structures` 里的坐标都是相对坐标，不是世界坐标。运行时会自动把它们平移到对应 `stagePresetId` 的 `mirrorOrigin`。
- `bubbleSlot` 是可选的；不填时会继承上一步；第一步默认 `top`。
- UI 侧一律同时维护 `src/RP/ui/server_form.jsonc` 和 `src/RP/ui/server_form.json`。前者保留注释，后者保持可直接用的纯 JSON，二者语义必须完全同步。
- 当前进度条判断条件依赖 `uiTitleMarker + 百分比`。如果同一个 `uiTitleMarker` 同时承载不同步数，100% 阶段和关键帧很容易冲突。最稳妥的做法是：新的步数支持尽量配一个新的 `stagePresetId / uiTitleMarker` 一起上。

## 1. 添加一个思索

下面用“给原版 `minecraft:tnt` 添加一个思索”为例。

### 第一步：新建场景文件

在 `src/BP/scripts/ponder/config/scenes/` 下新建 `tntDemo.js`：

```js
import {
  defineBlockStructure,
  defineBoxStructure,
  defineScene,
  defineStage,
} from "../factories.js";

export const tntDemoScene = defineScene({
  id: "tnt_demo",
  title: "TNT",
  entryItems: ["minecraft:tnt"],
  stagePresetId: "demo_8x8x8",
  tickingAreaName: "ponder_demo_tnt",
  structures: [
    defineBoxStructure(
      "pad",
      "minecraft:smooth_stone",
      { x: 2, y: 0, z: 2 },
      { x: 5, y: 0, z: 5 },
    ),
    defineBlockStructure("tnt_block", "minecraft:tnt", { x: 3, y: 1, z: 3 }),
    defineBlockStructure("trigger_block", "minecraft:redstone_block", {
      x: 4,
      y: 1,
      z: 3,
    }),
    defineBoxStructure(
      "blast_wall",
      "minecraft:glass",
      { x: 2, y: 1, z: 2 },
      { x: 5, y: 2, z: 5 },
    ),
  ],
  stages: [
    defineStage({
      bubbleSlot: "top",
      description: "先搭一个简单底座，给 TNT 一个清晰的展示位置。",
      add: ["pad"],
    }),
    defineStage({
      description: "把 TNT 放上去，这就是本次思索的核心方块。",
      add: ["tnt_block"],
    }),
    defineStage({
      bubbleSlot: "middle",
      description: "加入一个红石方块，用来表达点火或触发这个动作。",
      add: ["trigger_block"],
    }),
    defineStage({
      bubbleSlot: "bottom",
      description: "最后加一圈玻璃，强调 TNT 需要受控环境来展示。",
      add: ["blast_wall"],
    }),
  ],
});
```

这个示例里，思索场景当前真正支持并且和 UI 直接相关的字段，可以按下面理解：

```js
defineScene({
  id: "tnt_demo", // 必填，场景唯一 id
  title: "TNT", // 左上角标题文字；不写就显示为空
  iconPath: "textures/items/tnt", // 左上角标题图标；按 ActionFormData 的 iconPath 传字符串，建议只用 textures/... 资源包路径
  entryItems: ["minecraft:tnt"], // 必填；玩家手持这些物品使用时触发思索
  stagePresetId: "demo_8x8x8", // 必填；决定结构渲染预设、相机焦点、进度条标题标记
  tickingAreaName: "ponder_demo_tnt", // 必填；对应演示区域的 ticking area 名称，必须唯一
  specialBlockIcons: [
    {
      iconPath: "textures/items/redstone_dust", // 左侧小图标贴图路径；不写这个图标就不会显示
      tooltipText: "Redstone Block", // 该图标的 purple tip 文本；可空字符串
    },
    // 最多支持 6 个；超过 6 个会被截断
  ],
  structures: [
    // 结构定义列表；这里只负责声明内容，步骤里再通过 add/remove 控制显隐
    defineEntityStructure("guide", "minecraft:villager_v2", { x: 3.5, y: 1, z: 3.5 }, {
      rotation: { x: 0, y: 180 }, // 可选：实体朝向
      spawnEvent: "minecraft:entity_spawned", // 可选：生成时使用的事件
      nameTag: "Guide", // 可选：实体名牌
      triggerEvents: ["minecraft:become_adult"], // 可选：生成后依次触发的实体事件
    }),
  ],
  stages: [
    defineStage({
      description: "加入一个红石方块，用来表达点火或触发这个动作。", // 当前步骤的气泡文字
      bubbleSlot: "middle", // 可选：top / middle / bottom；不写则继承上一步，第一步默认 top
      add: ["trigger_block"], // 本步新增显示的 structure id
      remove: ["pad"], // 可选：本步移除显示的 structure id
    }),
  ],
});
```

### 第二步：把场景注册进索引

修改 `src/BP/scripts/ponder/config/scenes/index.js`：

```js
import { assemblyDemoScene } from "./assemblyDemo.js";
import { forgeDemoScene } from "./forgeDemo.js";
import { tntDemoScene } from "./tntDemo.js";

export const PONDER_SCENES = [assemblyDemoScene, forgeDemoScene, tntDemoScene];
```

### 第三步：确认这几个字段不要写错

- `id` 必须唯一。
- `tickingAreaName` 必须唯一。
- `entryItems` 就是触发物品。这里写 `minecraft:tnt`，玩家手持 TNT 使用时就会尝试打开这个思索。
- `stagePresetId` 必须能在 `src/BP/scripts/ponder/config/presets.js` 的 `STAGE_PRESETS` 里找到。
- `stages.length` 必须落在当前 UI 已支持的步数里。当前现成支持的是 4 步和 6 步。

### 第四步：测试

如果上面都对了，进游戏后手持 TNT 使用，就会走到这个思索。

## 2. 添加步数预设

下面用“新增一个 5 步支持”为例。

### 先说明当前项目里的真实规则

当前项目没有单独的 `scene.progressPresetId` 字段。

所谓“几步”，实际上由 `scene.stages.length` 直接决定：

- 场景里写了 5 个 `defineStage(...)`，运行时就会按 5 步计算百分比。
- `src/BP/scripts/ponder/config/progressPresets.js` 只是维护“哪些步数被项目正式支持”，主要用于校验和警告。
- 真正决定 UI 能不能正常显示 5 步进度条的，是 `server_form.jsonc / server_form.json` 里那一整套进度条动画、填充和关键帧规则。

所以新增 5 步，必须做脚本侧和 UI 侧两件事。

### 第一步：把 5 步加入脚本侧支持列表

修改 `src/BP/scripts/ponder/config/progressPresets.js`：

```js
export const PROGRESS_STAGE_PRESETS = {
  steps_4: { stageCount: 4 },
  steps_5: { stageCount: 5 },
  steps_6: { stageCount: 6 },
};
```

做到这里以后：

- `registry.js` 不会再对 5 步场景报“不受支持”的警告。
- 但 UI 还不会自动拥有 5 步进度条。

### 第二步：在 UI 里补 5 步进度条

修改这两个文件，保持同步：

- `src/RP/ui/server_form.jsonc`
- `src/RP/ui/server_form.json`

最省事的做法不是从零写，而是直接照文件里已经准备好的注释模板去补。下面的示例都按当前项目真实字段来写，假设这套 5 步规则绑定给新的 `uiTitleMarker = §4§r§3§r`。`jsonc` 可以保留注释，`json` 需要写成同样的内容但去掉注释。

先在 `server_form.jsonc / server_form.json` 顶层补 5 步动画：

```jsonc
"progress_anim_5_1": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_1_motion"
},
"progress_anim_5_1_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 0, 3 ],
  "to": [ 45, 3 ]
},
"progress_anim_5_2": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_2_motion"
},
"progress_anim_5_2_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 45, 3 ],
  "to": [ 90, 3 ]
},
...
"progress_anim_5_5": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_5_motion"
},
"progress_anim_5_5_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 179, 3 ],
  "to": [ 224, 3 ]
},
"progress_anim_5_reverse_1": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_reverse_1_motion"
},
"progress_anim_5_reverse_1_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 90, 3 ],
  "to": [ 45, 3 ]
},
...
"progress_anim_5_reverse_4": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_reverse_4_motion"
},
"progress_anim_5_reverse_4_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 224, 3 ],
  "to": [ 179, 3 ]
}
```

然后在 `ponder_progress_bar.controls` 里补这一套填充块。重复项很多，中间可以省略，但字段名和绑定规则必须保持同样结构：

```jsonc
"ponder_progress_bar": {
  "type": "panel",
  "size": [ 228, 9 ],
  "controls": [
    {
      "track_background": {
        "type": "image",
        "size": [ "100%", "100%" ],
        "texture": "textures/ui/ponder/progress_track"
      }
    },
    {
      "fill_2x3x2_stage_1": {
        "type": "panel",
        "layer": 2,
        "anchor_from": "top_left",
        "anchor_to": "top_left",
        "offset": [ 2, 3 ],
        "size": [ 45, 3 ],
        "clips_children": true,
        "property_bag": {
          "#current_title_text": ""
        },
        "controls": [
          {
            "fill_image": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "size": [ 224, 3 ],
              "texture": "textures/ui/ponder/progress_fill"
            }
          }
        ],
        "bindings": [
          {
            "binding_name": "#title_text",
            "binding_name_override": "#current_title_text"
          },
          {
            "binding_type": "view",
            "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r20') = #current_title_text)) and ((#current_title_text - '§6§r') = #current_title_text) and ((#current_title_text - '§7§r') = #current_title_text))",
            "target_property_name": "#visible"
          }
        ]
      }
    },
    {
      "fill_2x3x2_stage_1_anim": {
        "type": "panel",
        "layer": 2,
        "anchor_from": "top_left",
        "anchor_to": "top_left",
        "offset": [ 2, 3 ],
        "size": [ 0, 3 ],
        "clips_children": true,
        "property_bag": {
          "#current_title_text": ""
        },
        "controls": [
          {
            "fill_image": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "size": [ 224, 3 ],
              "texture": "textures/ui/ponder/progress_fill"
            }
          }
        ],
        "bindings": [
          {
            "binding_name": "#title_text",
            "binding_name_override": "#current_title_text"
          },
          {
            "binding_type": "view",
            "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r20') = #current_title_text)) and (not ((#current_title_text - '§6§r') = #current_title_text)))",
            "target_property_name": "#visible"
          }
        ],
        "anims": [
          "@server_form.progress_anim_5_1"
        ],
        "disable_anim_fast_forward": true
      }
    },
    {
      "fill_2x3x2_stage_1_reverse_anim": {
        "type": "panel",
        "layer": 2,
        "anchor_from": "top_left",
        "anchor_to": "top_left",
        "offset": [ 2, 3 ],
        "size": [ 90, 3 ],
        "clips_children": true,
        "property_bag": {
          "#current_title_text": ""
        },
        "controls": [
          {
            "fill_image": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "size": [ 224, 3 ],
              "texture": "textures/ui/ponder/progress_fill"
            }
          }
        ],
        "bindings": [
          {
            "binding_name": "#title_text",
            "binding_name_override": "#current_title_text"
          },
          {
            "binding_type": "view",
            "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r20') = #current_title_text)) and (not ((#current_title_text - '§7§r') = #current_title_text)))",
            "target_property_name": "#visible"
          }
        ],
        "anims": [
          "@server_form.progress_anim_5_reverse_1"
        ],
        "disable_anim_fast_forward": true
      }
    },
    ...,
    {
      "fill_2x3x2_stage_5": {
        "type": "panel",
        "layer": 2,
        "anchor_from": "top_left",
        "anchor_to": "top_left",
        "offset": [ 2, 3 ],
        "size": [ 224, 3 ],
        "clips_children": true,
        "property_bag": {
          "#current_title_text": ""
        },
        "controls": [
          {
            "fill_image": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "size": [ 224, 3 ],
              "texture": "textures/ui/ponder/progress_fill"
            }
          }
        ],
        "bindings": [
          {
            "binding_name": "#title_text",
            "binding_name_override": "#current_title_text"
          },
          {
            "binding_type": "view",
            "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r100') = #current_title_text)) and ((#current_title_text - '§6§r') = #current_title_text) and ((#current_title_text - '§7§r') = #current_title_text))",
            "target_property_name": "#visible"
          }
        ]
      }
    },
    {
      "fill_2x3x2_stage_5_anim": {
        "type": "panel",
        "layer": 2,
        "anchor_from": "top_left",
        "anchor_to": "top_left",
        "offset": [ 2, 3 ],
        "size": [ 179, 3 ],
        "clips_children": true,
        "property_bag": {
          "#current_title_text": ""
        },
        "controls": [
          {
            "fill_image": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "size": [ 224, 3 ],
              "texture": "textures/ui/ponder/progress_fill"
            }
          }
        ],
        "bindings": [
          {
            "binding_name": "#title_text",
            "binding_name_override": "#current_title_text"
          },
          {
            "binding_type": "view",
            "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r100') = #current_title_text)) and (not ((#current_title_text - '§6§r') = #current_title_text)))",
            "target_property_name": "#visible"
          }
        ],
        "anims": [
          "@server_form.progress_anim_5_5"
        ],
        "disable_anim_fast_forward": true
      }
    },
    {
      "keyframes_2x3x2": {
        "type": "panel",
        "layer": 3,
        "size": [ "100%", "100%" ],
        "property_bag": {
          "#current_title_text": ""
        },
        "bindings": [
          {
            "binding_name": "#title_text",
            "binding_name_override": "#current_title_text"
          },
          {
            "binding_type": "view",
            "source_property_name": "(not ((#current_title_text - '§4§r§3§r') = #current_title_text))",
            "target_property_name": "#visible"
          }
        ],
        "controls": [
          {
            "marker_1": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "offset": [ 46, 2 ],
              "size": [ 2, 5 ],
              "texture": "textures/ui/ponder/progress_keyframe"
            }
          },
          {
            "marker_2": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "offset": [ 91, 2 ],
              "size": [ 2, 5 ],
              "texture": "textures/ui/ponder/progress_keyframe"
            }
          },
          {
            "marker_3": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "offset": [ 135, 2 ],
              "size": [ 2, 5 ],
              "texture": "textures/ui/ponder/progress_keyframe"
            }
          },
          {
            "marker_4": {
              "type": "image",
              "anchor_from": "top_left",
              "anchor_to": "top_left",
              "offset": [ 180, 2 ],
              "size": [ 2, 5 ],
              "texture": "textures/ui/ponder/progress_keyframe"
            }
          }
        ]
      }
    }
  ]
}
```

上面这套实际就是把这六类模板具体展开：

- `progress_anim_C_i`
- `progress_anim_C_reverse_j`
- `fill_C_stage_i`
- `fill_C_stage_i_anim`
- `fill_C_stage_i_reverse_anim`
- `keyframes_C`

展开时真正需要你替换的只有三类值：

- 步数对应的宽度
- `uiTitleMarker` 对应的可见性字符串
- 新结构预设对应的块名，例如这里示例写的是 `fill_2x3x2_stage_*`

### 第三步：5 步需要用到的数值

当前进度条有效填充宽度是 `224`，高度是 `3`。

5 步时：

- 百分比：`20`、`40`、`60`、`80`、`100`
- 宽度公式：`WIDTH(i) = round(224 * i / 5)`
- 具体宽度：`45`、`90`、`134`、`179`、`224`
- 关键帧 x 坐标公式：`MARKER_X(i) = round(224 * i / 5) + 1`
- 具体关键帧位置：`46`、`91`、`135`、`180`

也就是说，你至少要补：

- 正向动画 `progress_anim_5_1` 到 `progress_anim_5_5`
- 反向动画 `progress_anim_5_reverse_1` 到 `progress_anim_5_reverse_4`
- 对应结构预设的 `fill_*` 规则
- 对应结构预设的 `keyframes_*` 规则

### 第四步：5 步不是全局自动生效，而是要和具体结构预设绑起来

这一步最容易误解。

当前 UI 的可见性判断，本质上看的是：

`TITLE_MARKER + uiTitleMarker + PROGRESS_MARKER + 百分比`

所以你不是只加一个 `steps_5` 就完了，还要为“哪个 `uiTitleMarker` 要走 5 步”补一套规则。

最稳妥的做法是：

- 新的 5 步场景，配一个新的 `stagePresetId`
- 这个新的 `stagePresetId` 配一个新的 `uiTitleMarker`
- 再在 `server_form.jsonc / json` 里，用这个新的 `uiTitleMarker` 去写 5 步进度条规则

如果你强行让现有 `demo_8x8x8` 或 `demo_16x16x16` 同时承载另一套步数，100% 阶段和关键帧容易撞规则。

## 3. 添加渲染结构预设

下面用“新增一个 `2x3x2` 的渲染结构预设”为例。

### 第一步：在脚本侧注册新的 `stagePresetId`

修改 `src/BP/scripts/ponder/config/presets.js`：

```js
import { defineStagePreset } from "./factories.js";

export const STAGE_PRESETS = {
  demo_8x8x8: defineStagePreset({
    uiTitleMarker: "\u00A74\u00A7r\u00A71\u00A7r",
    mirrorOrigin: { x: 0, y: 100, z: 0 },
    size: { x: 8, y: 8, z: 8 },
    focus: { x: 3, y: 3, z: 3 },
  }),
  demo_16x16x16: defineStagePreset({
    uiTitleMarker: "\u00A74\u00A7r\u00A72\u00A7r",
    mirrorOrigin: { x: 20, y: 100, z: 0 },
    size: { x: 16, y: 16, z: 16 },
    focus: { x: 7, y: 4, z: 7 },
  }),
  demo_2x3x2: defineStagePreset({
    uiTitleMarker: "\u00A74\u00A7r\u00A73\u00A7r",
    mirrorOrigin: { x: 40, y: 100, z: 0 },
    size: { x: 2, y: 3, z: 2 },
    focus: { x: 0, y: 1, z: 0 },
  }),
};
```

这里要注意三点：

- `uiTitleMarker` 必须唯一，不能和现有预设重复。
- `mirrorOrigin` 必须选一个没被别的预设占用的位置。
- `focus` 是相对坐标，不是世界坐标。上面这个例子会把镜头中心放在结构中间偏上的位置。

### 第二步：在 UI 里补结构渲染器

修改这两个文件，保持同步：

- `src/RP/ui/server_form.jsonc`
- `src/RP/ui/server_form.json`

复制现有的 `ponder_structure_renderer_8` 或 `ponder_structure_renderer_16`，补一份新的：

```jsonc
"ponder_structure_renderer_2x3x2": {
  "type": "input_panel",
  "size": [ "100%", "100%" ],
  "focus_enabled": true,
  "gesture_tracking_button": "button.turn_structure",
  "always_handle_controller_direction": true,
  "button_mappings": [
    {
      "from_button_id": "button.menu_select",
      "to_button_id": "button.turn_structure",
      "mapping_type": "pressed",
      "button_up_right_of_first_refusal": true
    }
  ],
  "controls": [
    {
      "renderer_static@server_form.ponder_structure_renderer_window": {
        "$gesture_source_control": "structure_renderer_2x3x2",
        "$focus": [ 40, 101, 0 ],
        "$bottom_left": [ 40, 100, 0 ],
        "$top_right": [ 41, 102, 1 ],
        "$window_visibility_expression": "((#current_title_text - '§8§r') = #current_title_text)"
      }
    },
    {
      "renderer_intro@server_form.ponder_structure_renderer_window_intro": {
        "$gesture_source_control": "structure_renderer_2x3x2",
        "$focus": [ 40, 101, 0 ],
        "$bottom_left": [ 40, 100, 0 ],
        "$top_right": [ 41, 102, 1 ],
        "$window_visibility_expression": "(not ((#current_title_text - '§8§r') = #current_title_text))"
      }
    }
  ]
}
```

上面这些值的来源分别是：

- `$focus = mirrorOrigin + focus`
- `$bottom_left = mirrorOrigin`
- `$top_right = mirrorOrigin + size - 1`

### 第三步：在 UI 里补预览面板

继续在这两个 UI 文件里补一份新的预览面板：

```jsonc
"ponder_preview_panel_2x3x2": {
  "type": "panel",
  "size": [ "100%", "100%" ],
  "bindings": [
    {
      "binding_name": "#title_text"
    },
    {
      "binding_type": "view",
      "source_property_name": "(not ((#title_text - '§4§r§3§r') = #title_text))",
      "target_property_name": "#visible"
    }
  ],
  "controls": [
    {
      "structure_renderer_2x3x2@server_form.ponder_structure_renderer_2x3x2": {
        "size": [ "100%", "100%" ]
      }
    }
  ]
}
```

然后把它挂进总预览面板：

```jsonc
"ponder_preview_panel": {
  "type": "panel",
  "size": [ "100%", "100%" ],
  "controls": [
    {
      "preview_8@server_form.ponder_preview_panel_8": {}
    },
    {
      "preview_16@server_form.ponder_preview_panel_16": {}
    },
    {
      "preview_2x3x2@server_form.ponder_preview_panel_2x3x2": {}
    }
  ]
}
```

### 第四步：在场景里使用它

之后任意一个新场景都可以直接写：

```js
stagePresetId: "demo_2x3x2"
```

只要这个场景里的结构坐标都落在 `2x3x2` 范围内，渲染就会走这套新预设。

### 第五步：别忘了进度条也是按这个预设的 `uiTitleMarker` 走的

如果 `demo_2x3x2` 对应的场景不只是复用现成 4 步或 6 步，而是还要承载新的 5 步，那就要继续在 `server_form.jsonc / json` 里，为 `§4§r§3§r` 这套 `uiTitleMarker` 补对应的进度条规则。

## 最后检查一次

新增一个完整可用的思索，通常至少会动到这些文件：

- `src/BP/scripts/ponder/config/scenes/你的场景文件.js`
- `src/BP/scripts/ponder/config/scenes/index.js`
- `src/BP/scripts/ponder/config/presets.js`
- `src/BP/scripts/ponder/config/progressPresets.js`
- `src/RP/ui/server_form.jsonc`
- `src/RP/ui/server_form.json`

如果只是：

- 新增一个场景，但复用现有 4 步和现有结构预设：通常只改场景文件和场景索引。
- 新增一个结构预设：一定要同时补脚本预设和 UI 预览。
- 新增一个步数支持：一定要同时补脚本支持和 UI 进度条。

项目里相关文件已经保留了模板注释，优先照模板扩展，不要自己发明新的命名和标记规则。
