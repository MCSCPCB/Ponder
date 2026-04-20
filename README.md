# Ponder

## 1. 如何添加一个思索

下面用“给原版 `minecraft:redstone_lamp` 添加一个思索”为例。

### 第一步：新建场景文件

在 `src/BP/scripts/ponder/config/scenes/` 下新建 `redstoneLampDemo.js`：

```js
import {
  defineBlockStructure,
  defineEntityStructure,
  defineStage,
} from "../factories.js";

const platformTiles = [];
const platformTileIds = [];

for (let x = 1; x <= 6; x += 1) {
  for (let z = 1; z <= 6; z += 1) {
    const id = `platform_${x}_${z}`;
    platformTileIds.push(id);
    platformTiles.push(
      defineBlockStructure(
        id,
        (x + z) % 2 === 0 ? "minecraft:light_gray_terracotta" : "minecraft:snow",
        { x, y: 0, z },
      ),
    );
  }
}

export const redstoneLampDemoScene = {
  id: "redstone_lamp_demo", // 必填：场景唯一 id
  title: "Redstone Lamp", // 可选：左上角标题文字
  iconPath: "textures/blocks/redstone_lamp_off", // 可选：左上角标题图标路径
  entryItems: ["minecraft:redstone_lamp"], // 必填：玩家手持这些物品使用时触发思索
  stagePresetId: "demo_8x8x8", // 必填：使用哪个场景渲染结构尺寸预设
  tickingAreaName: "ponder_demo_redstone_lamp", // 必填：演示区域 ticking area 名称，必须唯一
  specialBlockIcons: [
    {
      iconPath: "textures/blocks/redstone_block", // 可选：左侧小图标贴图路径
      tooltipText: "红石块会持续输出信号，且不能关闭。", // 可选：这个小图标的提示文本，可写空字符串
    },
    // 可选：最多 6 个；超过 6 个只显示前 6 个
  ],
  messages: {
    inUse: "这个思索正在被其他玩家使用。", // 可选：已有玩家占用这个思索时发给后来玩家的消息
    invalidDimension: "这个思索当前只能在主世界使用。", // 可选：玩家不在主世界时的消息
    missingStages: "这个思索没有配置任何步骤。", // 可选：场景没有步骤时的消息
  },
  structures: [
    ...platformTiles,
    defineBlockStructure(
      "lamp_off", // 单方块结构 id
      "minecraft:redstone_lamp", // 方块 id
      { x: 3, y: 1, z: 3 }, // 相对坐标
    ),
    defineBlockStructure(
      "adjacent_power_block",
      "minecraft:redstone_block",
      { x: 2, y: 1, z: 3 },
    ),
    defineBlockStructure(
      "top_dust",
      "minecraft:redstone_wire",
      { x: 3, y: 2, z: 3 },
    ),
    defineBlockStructure(
      "relay_lamp_on",
      "minecraft:redstone_lamp",
      { x: 4, y: 1, z: 3 },
    ),
    defineEntityStructure(
      "pp", // 实体结构 id
      "minecraft:armor_stand", // 实体类型 id
      { x: 3, y: 2, z: 3 }, // 实体相对坐标
      {
        rotation: { x: 0, y: 180 }, // 可选：实体朝向
        //spawnEvent: "minecraft:entity_spawned", // 可选：生成时使用的事件
        nameTag: "PP", // 可选：实体名牌
        triggerEvents: [], // 可选：生成后依次触发的实体事件；这里不需要就写空数组
      },
    ),
  ],
  stages: [
    defineStage({
      description: "红石灯默认不会自己发亮，只有收到红石信号才会立刻点亮。", // 必填：当前步骤气泡文字
      bubbleSlot: "top", // 可选：top / middle / bottom；不写则继承上一步，第一步默认 top
      add: [...platformTileIds, "lamp_off", "pp"], // 可选：本步新增显示的 structure id 列表
      remove: [], // 可选：本步移除显示的 structure id 列表
    }),
    defineStage({
      description: "毗邻的开启电源或毗邻的充能方块都能直接点亮红石灯。",
      bubbleSlot: "top",
      add: ["adjacent_power_block"],
      remove: [],
    }),
    defineStage({
      description: "指向红石灯的红石粉、中继器、比较器也能点亮它，包括红石灯上方的红石粉。",
      bubbleSlot: "middle",
      add: ["top_dust"],
      remove: [],
    }),
    defineStage({
      description: "红石灯失去信号后要过 4 游戏刻才会熄灭，而且它本身是红石导体，被充能时也能继续带动相邻元件。",
      bubbleSlot: "bottom",
      add: ["relay_lamp_on"],
      remove: [],
    }),
  ],
};
```

这个例子使用的是 `demo_8x8x8`，所以 `structures` 里的坐标范围必须落在：

- `x = 0 ~ 7`
- `y = 0 ~ 7`
- `z = 0 ~ 7`

### 第二步：把场景注册进索引

修改 `src/BP/scripts/ponder/config/scenes/index.js`：

```js
import { assemblyDemoScene } from "./assemblyDemo.js";
import { forgeDemoScene } from "./forgeDemo.js";
import { redstoneLampDemoScene } from "./redstoneLampDemo.js";

export const PONDER_SCENES = [
  assemblyDemoScene,
  forgeDemoScene,
  redstoneLampDemoScene,
];
```

### 第三步：照着检查这几项

- `id` 必须唯一。
- `tickingAreaName` 必须唯一。
- `entryItems` 里写的就是触发物品。
- `stagePresetId` 必须已经存在于 `src/BP/scripts/ponder/config/presets.js`。
- `add` 和 `remove` 里引用的每个结构 id，都必须已经在 `structures` 里声明过。

### 第四步：测试

如果上面都对了，进游戏后手持红石灯使用，就会触发这个思索。

如果你只是新增一个场景，并且：

- 复用现有步数支持
- 复用现有尺寸预设

那通常只需要改两个地方：

- `src/BP/scripts/ponder/config/scenes/你的场景文件.js`
- `src/BP/scripts/ponder/config/scenes/index.js`

## 2. 如何添加结构尺寸预设

下面用“新增一个 `demo_2x3x2` 尺寸预设”为例。

### 第一步：在脚本侧注册新的尺寸预设

修改 `src/BP/scripts/ponder/config/presets.js`：

```js
import { defineStagePreset } from "./factories.js";

export const STAGE_PRESETS = {
  demo_8x8x8: defineStagePreset({
    uiTitleMarker: "§4§r§1§r",
    mirrorOrigin: { x: 0, y: 100, z: 0 },
    size: { x: 8, y: 8, z: 8 },
    focus: { x: 3, y: 3, z: 3 },
  }),
  demo_16x16x16: defineStagePreset({
    uiTitleMarker: "§4§r§2§r",
    mirrorOrigin: { x: 20, y: 100, z: 0 },
    size: { x: 16, y: 16, z: 16 },
    focus: { x: 7, y: 4, z: 7 },
  }),
  demo_2x3x2: defineStagePreset({
    uiTitleMarker: "§4§r§3§r", // 必填：这个尺寸预设自己的标题标记，必须唯一
    mirrorOrigin: { x: 40, y: 100, z: 0 }, // 必填：镜像起点，不能和别的尺寸预设重叠
    size: { x: 2, y: 3, z: 2 }, // 必填：结构尺寸
    focus: { x: 0, y: 1, z: 0 }, // 必填：预览焦点；相对坐标
  }),
};
```

这个例子里，`demo_2x3x2` 的合法坐标范围就是：

- `x = 0 ~ 1`
- `y = 0 ~ 2`
- `z = 0 ~ 1`

### 第二步：在 UI 里补结构渲染器

修改 `src/RP/ui/server_form.json`

加一份新的结构渲染器：

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
        "$gesture_source_control": "structure_renderer_2x3x2", // 这里要和当前 renderer 名字保持一致
        "$focus": [ 40, 101, 0 ], // mirrorOrigin + focus
        "$bottom_left": [ 40, 100, 0 ], // mirrorOrigin
        "$top_right": [ 41, 102, 1 ], // mirrorOrigin + size - 1
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

### 第三步：在 UI 里补预览面板

继续修改 `src/RP/ui/server_form.json`

先加一份新的预览面板：

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

### 第四步：在场景里使用这个尺寸预设

之后任意一个场景都可以直接这样写：

```js
stagePresetId: "demo_2x3x2"
```

只要这个场景里所有 `structures` 的坐标都落在下面这个范围里，就会走这套新尺寸预设：

- `x = 0 ~ 1`
- `y = 0 ~ 2`
- `z = 0 ~ 1`

### 第五步：照着检查这几项

- `src/BP/scripts/ponder/config/presets.js` 已经加入新的尺寸预设。
- `uiTitleMarker` 没有和现有尺寸预设重复。
- `mirrorOrigin` 没有和现有尺寸预设重叠。
- `src/RP/ui/server_form.json` 已经加入新的结构渲染器和预览面板。
- 场景文件里的 `stagePresetId` 已经改成这个新尺寸预设。

## 3. 添加场景步数预设

下面用“新增 5 步支持”为例。

这里假设我们使用刚刚定义好的demo_2x3x2尺寸预设，它的 `uiTitleMarker` 是 `§4§r§3§r`。

### 第一步：在 UI 顶层补 5 步动画

修改 `src/RP/ui/server_form.json`

把下面这整段加到 `json` 顶层：

```jsonc
// 5 步动画；下面示例假设这套规则绑定给 uiTitleMarker = §4§r§3§r
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
"progress_anim_5_3": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_3_motion"
},
"progress_anim_5_3_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 90, 3 ],
  "to": [ 134, 3 ]
},
"progress_anim_5_4": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_4_motion"
},
"progress_anim_5_4_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 134, 3 ],
  "to": [ 179, 3 ]
},
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
"progress_anim_5_reverse_2": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_reverse_2_motion"
},
"progress_anim_5_reverse_2_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 134, 3 ],
  "to": [ 90, 3 ]
},
"progress_anim_5_reverse_3": {
  "anim_type": "wait",
  "duration": 0,
  "next": "@server_form.progress_anim_5_reverse_3_motion"
},
"progress_anim_5_reverse_3_motion": {
  "anim_type": "size",
  "easing": "out_quart",
  "duration": 0.2,
  "from": [ 179, 3 ],
  "to": [ 134, 3 ]
},
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

### 第二步：在 `ponder_progress_bar.controls` 里补 5 步填充和关键帧

继续修改 `src/RP/ui/server_form.json`

把下面这些控件加进 `ponder_progress_bar.controls`。下面这组示例里：

- `2x3x2` 是这套规则使用的尺寸预设名字后缀
- `§4§r§3§r` 是这套规则使用的 `uiTitleMarker`；要和尺寸预设保持一致

```jsonc
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r20') = #current_title_text)) and ((#current_title_text - '§6§r') = #current_title_text) and ((#current_title_text - '§7§r') = #current_title_text))", // 注意看 §4§r§3§r 藏在了 §0§r§1§r§4§r§3§r§2§r20 中间
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
{
  "fill_2x3x2_stage_2": {
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r40') = #current_title_text)) and ((#current_title_text - '§6§r') = #current_title_text) and ((#current_title_text - '§7§r') = #current_title_text))",
        "target_property_name": "#visible"
      }
    ]
  }
},
{
  "fill_2x3x2_stage_2_anim": {
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r40') = #current_title_text)) and (not ((#current_title_text - '§6§r') = #current_title_text)))",
        "target_property_name": "#visible"
      }
    ],
    "anims": [
      "@server_form.progress_anim_5_2"
    ],
    "disable_anim_fast_forward": true
  }
},
{
  "fill_2x3x2_stage_2_reverse_anim": {
    "type": "panel",
    "layer": 2,
    "anchor_from": "top_left",
    "anchor_to": "top_left",
    "offset": [ 2, 3 ],
    "size": [ 134, 3 ],
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r40') = #current_title_text)) and (not ((#current_title_text - '§7§r') = #current_title_text)))",
        "target_property_name": "#visible"
      }
    ],
    "anims": [
      "@server_form.progress_anim_5_reverse_2"
    ],
    "disable_anim_fast_forward": true
  }
},
{
  "fill_2x3x2_stage_3": {
    "type": "panel",
    "layer": 2,
    "anchor_from": "top_left",
    "anchor_to": "top_left",
    "offset": [ 2, 3 ],
    "size": [ 134, 3 ],
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r60') = #current_title_text)) and ((#current_title_text - '§6§r') = #current_title_text) and ((#current_title_text - '§7§r') = #current_title_text))",
        "target_property_name": "#visible"
      }
    ]
  }
},
{
  "fill_2x3x2_stage_3_anim": {
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r60') = #current_title_text)) and (not ((#current_title_text - '§6§r') = #current_title_text)))",
        "target_property_name": "#visible"
      }
    ],
    "anims": [
      "@server_form.progress_anim_5_3"
    ],
    "disable_anim_fast_forward": true
  }
},
{
  "fill_2x3x2_stage_3_reverse_anim": {
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r60') = #current_title_text)) and (not ((#current_title_text - '§7§r') = #current_title_text)))",
        "target_property_name": "#visible"
      }
    ],
    "anims": [
      "@server_form.progress_anim_5_reverse_3"
    ],
    "disable_anim_fast_forward": true
  }
},
{
  "fill_2x3x2_stage_4": {
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r80') = #current_title_text)) and ((#current_title_text - '§6§r') = #current_title_text) and ((#current_title_text - '§7§r') = #current_title_text))",
        "target_property_name": "#visible"
      }
    ]
  }
},
{
  "fill_2x3x2_stage_4_anim": {
    "type": "panel",
    "layer": 2,
    "anchor_from": "top_left",
    "anchor_to": "top_left",
    "offset": [ 2, 3 ],
    "size": [ 134, 3 ],
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r80') = #current_title_text)) and (not ((#current_title_text - '§6§r') = #current_title_text)))",
        "target_property_name": "#visible"
      }
    ],
    "anims": [
      "@server_form.progress_anim_5_4"
    ],
    "disable_anim_fast_forward": true
  }
},
{
  "fill_2x3x2_stage_4_reverse_anim": {
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
        "source_property_name": "((not ((#current_title_text - '§0§r§1§r§4§r§3§r§2§r80') = #current_title_text)) and (not ((#current_title_text - '§7§r') = #current_title_text)))",
        "target_property_name": "#visible"
      }
    ],
    "anims": [
      "@server_form.progress_anim_5_reverse_4"
    ],
    "disable_anim_fast_forward": true
  }
},
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
        "source_property_name": "(not ((#current_title_text - '§4§r§3§r') = #current_title_text))", // 注意这里的 §4§r§3§r
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
```

### 第三步：照着检查这几项

- `src/RP/ui/server_form.json` 已经加入 5 步动画、填充、关键帧。
- 这套 5 步规则使用的是一个专用 `uiTitleMarker`。
- 场景里确实写了 5 个 `defineStage(...)`。
