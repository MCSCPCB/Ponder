# 场景作者指南（2.0.1）

本指南对应当前仓库实现，不是 Java Ponder API 的完整移植。作者负责提供可信的方块、实体和原生事件定义；校验器与展示区不是任意原生行为的沙箱。

## 1. 新增一个完整场景

在 `src/BP/scripts/ponder/config/scenes/quickStart.js` 新建以下内容。示例只使用普通对象，不依赖 Minecraft 模块，可在 Node 中直接校验。

<!-- test:scene-api -->
```js
const text = (zh_CN, en_US) => ({ zh_CN, en_US });

export const quickStartScene = {
  id: "quick_start",
  title: text("一个红石灯", "One redstone lamp"),
  itemTitle: text("木棍", "Stick"),
  description: text("通电、运镜，再恢复脚本状态。", "Power, orbit and restore authored state."),
  iconPath: "textures/blocks/redstone_lamp_off",
  entryItems: ["minecraft:stick"],
  tags: ["basics", "redstone"],
  order: 10,
  size: { x: 8, y: 8, z: 8 },
  focus: { x: 3.5, y: 2, z: 3.5 },
  camera: { yaw: 35, pitch: 32, distance: 30 },
  basePlate: {
    blockId: "minecraft:stone",
    from: { x: 1, y: 0, z: 1 },
    to: { x: 6, y: 0, z: 6 },
  },
  structures: [
    { id: "lamp", kind: "block", blockId: "minecraft:redstone_lamp",
      position: { x: 3, y: 1, z: 3 } },
  ],
  initial: ["lamp"],
  air: [{ from: { x: 1, y: 1, z: 1 }, to: { x: 6, y: 3, z: 6 } }],
  instructions: [
    { op: "keyframe", id: "unpowered", label: text("未通电", "Unpowered") },
    { op: "text", id: "intro", target: { x: 3.5, y: 1.5, z: 3.5 },
      text: text("先观察没有电源的红石灯。", "Start with an unpowered lamp."), duration: 80 },
    { op: "wait", ticks: 80 },
    { op: "keyframe", id: "powered", label: text("通电", "Powered") },
    { op: "block", blockId: "minecraft:redstone_block", position: { x: 2, y: 1, z: 3 } },
    { op: "parallel", branches: [
      [
        { op: "text", id: "power_note", color: "input",
          target: { x: 2.5, y: 1.5, z: 3.5 },
          text: text("灯的变化由原生红石逻辑决定。", "Native redstone decides how the lamp responds."),
          duration: 80 },
        { op: "wait", ticks: 80 },
      ],
      [
        { op: "outline", id: "lamp_box", color: "green", duration: 60,
          region: { from: { x: 3, y: 1, z: 3 }, to: { x: 3, y: 1, z: 3 } } },
        { op: "camera", yaw: 80, duration: 60 },
        { op: "wait", ticks: 60 },
      ],
    ] },
    { op: "keyframe", id: "restored", label: text("恢复", "Restored") },
    { op: "restore", region: { from: { x: 2, y: 1, z: 3 }, to: { x: 2, y: 1, z: 3 } } },
    { op: "text", id: "last_note", target: { x: 3.5, y: 1.5, z: 3.5 },
      text: text("恢复定义，不是倒放红石历史。", "Restore the blueprint, not redstone history."),
      duration: 80 },
    { op: "wait", ticks: 80 },
  ],
};
```

然后在 `config/scenes/index.js` 导入它，**追加**到已有 `PONDER_SCENES` 数组：

```js
import { quickStartScene } from "./quickStart.js";
// 在原数组中添加 quickStartScene，保留原有场景。
```

示例总长 240 tick，关键帧为 0、80、160。木棍已有装配场景，新增后可以通过下一场景或物品索引进入此场景。不要为了新增场景覆盖原有注册表。

```powershell
npm.cmd run verify
npm.cmd run pack
```

文档测试直接执行上面的完整示例并检查关键帧、脚本状态和中英文布局。**这不等同于游戏内验证方块 ID、红石效果或画面。**

## 2. 场景字段与坐标

所有作者坐标均为场景局部坐标，不是玩家坐标或固定世界坐标。租约分配时统一加上 `origin`。

| 字段 | 约定 |
| --- | --- |
| `id` | 唯一，`[a-z][a-z0-9_]{0,47}`；结构和事件 ID 也用此规则 |
| `title` | 场景标题：字符串或 `{ zh_CN, en_US }` |
| `itemTitle` | 可选，物品索引/多场景标题；同一物品以排序后第一个场景的标题元数据为准 |
| `description` | 索引卡片说明，支持中英文对象 |
| `entryItems` | 至少一个命名空间物品 ID；同物品可关联多个场景 |
| `iconPath` | 资源路径，如 `textures/items/stick`，不含扩展名；不会转换成 `item_id_aux` |
| `tags` / `order` | 标签 ID 数组、有限数值排序；相同 order 再按场景 ID 排序 |
| `size` | 每轴 1..32 的整数；块坐标为 `0..size-1`，区域两端均包含 |
| `stagePresetId` | 也可从 `config/presets.js` 取得 size/focus；显式字段优先 |
| `focus` | 观察中心；默认取预设或根据 size 计算 |
| `camera` | `yaw`、`pitch`、`distance`、可选 `focus`；初始默认 yaw 35、pitch 32、distance `22 + max(size.x, size.z)` |
| `visibleBounds` | 可选的局部整数盒；用于标注避让。默认根据所有结构估算，不随显隐变化 |
| `textScale` | 世界文字比例，0.02..0.1，默认 0.055；不随 GUI 缩放 |
| `structures` / `initial` | 结构定义数组、初始可见结构 ID 数组 |
| `basePlate` | `blockId/from/to/states`；自动生成并显示 ID 为 `base_plate` 的盒状结构，不要另定义同名结构 |
| `regions` | `{ 区域ID: { from, to } }`，供 `region` 指令显隐 |
| `air` | `{from,to}` 数组；在未被教学方块覆盖的位置使用空气而非默认光源方块 |
| `instructions` / `stages` | 二选一；同时写时 `instructions` 优先 |

标签须先在 `config/tags.js` 的 `PONDER_TAGS` 中注册 `id/title/description/iconPath/order`。一处未知标签、重复 ID 或不合法场景即可使注册/构建失败，不会静默略过。

`iconPath` 可以指向游戏或配套 RP 的资源。静态检查只能确认本包生成的贴图引用，不能证明客户端一定具备所有原版/第三方贴图；自定义图标须一起分发并实机检查。

相机 distance 限制 8..64、pitch 限制 -75..75。整体镜头与标注会扩大展示房间，因此“小结构”也可能需要较大空置空间；远距离相机会受展示区总体积上限限制。

## 3. 结构、方块与空气

可用工厂位于 `config/factories.js`，只是普通对象构造器：

```js
import {
  defineBlockStructure, defineBoxStructure, defineEntityStructure,
  defineStage, tiledBase, wait, parallel,
} from "../factories.js";

const lamp = defineBlockStructure("lamp", "minecraft:redstone_lamp", { x: 3, y: 1, z: 3 });
const base = defineBoxStructure("base", "minecraft:stone",
  { x: 1, y: 0, z: 1 }, { x: 6, y: 0, z: 6 });
const mob = defineEntityStructure("pig", "minecraft:pig", { x: 4, y: 1, z: 4 },
  { nameTag: "Demo" });
```

- `kind: "block"`：`blockId/position/states`。
- `kind: "box"`：`blockId/from/to/states`，两端包含。
- `kind: "entity"`：`entityTypeId/position`，可带 `rotation/nameTag/event/impulse`。
- `kind: "item"`：`itemId/position/amount`，数量 1..64；可直接写普通对象。
- `tiledBase(width, depth = width)` 生成棋盘基座结构数组，但不会自动加入 `initial`。

方块 `states` 值只能是布尔、字符串或有限数字；具体状态名和值最终由目标 Minecraft 的 `BlockPermutation` 校验。渲染器在一批重建写入前先解析全部方块排列，避免某个非法状态写到一半才发现。

普通教学 tick 只写入脚本定义发生变化的方块，**不会每 tick 把原生更新强行改回去**。seek/replay 则明确重建作者状态。

`show/hide` 作用于结构，`region` 是对最终方块集合的区域可见性过滤，`block` 写入单独 patch。重叠的 patch 优先于结构；隐藏区域仍会过滤 patch。隐藏后恢复的是背景光源或显式空气，不播放伪方块滑动。

`restore` 只清除指定区域的 authored patch，使底层结构定义重新生效；不修改结构 show/hide、区域 visible，也不还原任意世界快照。

## 4. 时间轴语义

- 时间单位为**整数教学 tick**，从 0 开始；不要把 `duration` 当成毫秒。
- 默认指令在当前 cursor 执行，**`duration` 本身不阻塞后续指令**。
- `wait(ticks)` / `{op:"wait", ticks}` 推进 cursor。
- `blocking:true` 将 cursor 推到该事件的 `at + duration`。
- `at` 是绝对教学 tick，不是相对等待；parallel 分支中也一样，不能早于该分支的起点。
- 同一 tick 的事件按声明遍历顺序处理。
- parallel 的分支从同一 cursor 开始，结束取各分支 cursor 的最大值。分支只有非阻塞 duration 而没有 wait 时，join 不等待该 duration。
- 最终场景长度仍覆盖全部事件的 `at + duration`，即使事件本身不阻塞。
- `keyframe` 在当前 cursor 建标记，不用它的 `at` 设置时间；需要时先 wait。缺少 tick 0 标记时自动补齐，同 tick 标记保留后一个。
- 镜头动画不能互相重叠；后续局部镜头指令继承前一条完成后的状态。用 wait 等待前一次运动，不要在 parallel 分支中同时控制相机。

### 简化的 `stages`

内置场景使用 `defineStage()`，默认 `duration:100`、空 `add/remove`。

每一步依次生成：关键帧 → hide(remove) → show(add) → 清除上一批标注 → description 文本 → 自定义 instructions → wait(duration)。

说明可配置 `title/description/target/color/side`。`stage.instructions` 内如果又有 wait 或 blocking，会**额外**推进 cursor；只有内部指令均不阻塞时，总长度才等于各 stage.duration 之和。

不要在一个需要保持说明的步骤末尾无意插入 `clear`；相同标注 ID 在后续指令中会替换原标注。

## 5. 指令速查

| op | 核心字段与行为 |
| --- | --- |
| `wait` | `ticks`，推进时间 |
| `parallel` | `branches: [指令数组, ...]`，并行时间分支 |
| `keyframe` | 可选 `id/label`，当前 cursor 的可点击标记 |
| `show` / `hide` | `ids: [结构ID, ...]`，即时显示/隐藏，不使用 duration 过渡 |
| `block` | `blockId/states` 加 `position` 或 `region`，写方块 patch |
| `restore` | 可选 `region`，清除范围内 patch；省略则清除全部 patch |
| `region` | `id/visible`，修改已声明区域的方块可见性 |
| `text` | `id/text`、可选 target/track、duration/color/side/through/maxWidth |
| `outline` | `id` 和 `region` 或 `track`，可选 duration/color/width/through |
| `controls` | `id/action`，可选 iconPath/target/track/duration/color/side/through |
| `clear` | 可选 `id`，删除标注；省略则删除全部标注，不删除教学实体 |
| `spawn` | `id`、`entityTypeId` 或 `itemId`、`position`，可选 amount/duration/rotation/nameTag/event/impulse |
| `updateEntity` | `id`，更新仍存活的教学实体的 position/rotation/nameTag/event/impulse；不会复活已移除实体 |
| `removeEntity` | `id`，移除该教学实体 |
| `particle` | `particleId/position`，可选 duration/interval/count |
| `camera` | yaw/pitch/distance/focus 的局部目标、duration、可选 blocking |

### 标注

- target 为局部坐标；默认使用 scene.focus。`track` 指向已声明的教学实体 ID，使用其实际包围盒/中心。
- outline 的区域端点包含整个方块；跟踪实体使用实际边界，不额外加一格。
- side 为 `auto/left/right/top/bottom`；指定的是优先候选，放不下时尝试其他侧，不是固定屏幕槽位。
- `through` 默认 true；false 使用深度遮挡材质。材质最终效果需实机验收。
- `width` 用于 outline，范围 0.005..0.15，默认 0.028。
- `maxWidth` 为 8..180，默认 180；行距 9。超过 512 字符或 12 行会报错，应拆段而非裁掉正文。
- 同时说明过多、太长或镜头太近导致布局放不下时，抛错并退出恢复玩家；不要通过放大资源上限掩盖布局问题。
- color 可用 `white/black/red/green/blue/slow/medium/fast/input/output` 或 `0x000000..0xffffff`。
- text 使用 `§0..§f` 颜色、`§r` 重置；不支持完整粗体/斜体/随机字形排版。超出 BMP 的字符替换为 `?`。
- `controls.action` 支持 `use/attack/scroll/slot`。文本按键鼠、触屏或手柄类型生成通用描述；`iconPath` 可替换为教学物品图标，默认用动作图标。
- text/outline/controls 的 duration 为 0 或省略时持续到 clear、同 ID 替换或会话结束；非零时在 `at + duration` 失效。

### 教学实体与粒子

- spawn 的 duration 为 0/省略时持续到 removeEntity 或会话结束；其他值控制作者生命周期。
- nameTag 是已经解析好的字符串，不接收本地化对象；不会通过每 tick teleport 冻结 AI。
- 原生死亡、拾取或 despawn 的实体不会每 tick 自动复活；seek/replay 会按作者状态重新创建。
- `event` 与 `impulse` 是一次性效果；仅在自然播放跨到该更新时执行，不在普通名称更新时重复继承。
- `updateEntity` 不重新计算 spawn 的到期时间；要建立新的生命周期请明确再次 spawn。
- `particle` 默认 interval 5、count 1，两者必须为 1..32 的整数；duration 0 在该 tick 发射一次，非零在包含结束 tick 的区间按 interval 发射。
- 粒子每次 renderer 更新最多发射 128 次；落后补帧超过上限时丢弃旧发射，不积累欠账。已发射粒子由原生生命周期结束。

## 6. 跳转、暂停和返回

seek 不依赖上一次停在哪：从 initial 和目标 tick 之前的脚本指令重建方块、显隐、教学实体、标注和相机。

- **不补播过去的粒子、实体 event 或 impulse**。
- 初次自然进入 tick 0、明确重播、完成后再次播放，可执行起始 tick 的一次性效果。
- 历史返回恢复保存的 authored tick/播放状态/舒适阅读状态，不重放过去的一次性效果。
- 暂停、索引和舒适阅读只影响教学推进，不改变服务器原生模拟速度。
- 重建不能复原先前某一时刻的原生红石、AI、物品运动、容器内容或水流历史；这些不是本 API 的状态快照。

## 7. 资源预算与验证

上限定义在 `constants.js`：

| 资源 | 上限 |
| --- | ---: |
| 并发会话 | 4（还受原生常加载容量约束） |
| 每次展示区候选尝试 | 24 |
| 安全缓冲 / 额外玩家距离 | 3 / 96 格 |
| 脚本方块集合 | 16,384 |
| 房间与安全缓冲体积 | 1,200,000 |
| 场景长度 / 时间轴事件 | 3,600 tick / 512 |
| 关键帧 | 24 |
| 同时标注 / 单条文字 | 6 / 512 字符、12 行 |
| 标注实体 / 教学实体 | 192 / 48 |
| 可归属的原生副产物实体 | 128 |
| 每次更新的粒子发射调用 | 128 |
| 侧栏 / 每页索引卡片 | 6 / 8 |
| 表单 UserBusy 重试 | 初次之后最多 3 次 |

一个文本标注可能需要多个实体（每 8 个同色字形一组），轮廓有多条线，所以“未超过 6 个标注”不保证低于实体预算。超额教学副产物会触发安全退出；不以删除无所有权标记的访客实体解决超限。

新增内容后：

1. 运行 verify 检查注册、生成资源和已有回归测试。
2. 为新场景补每 tick、多语言的 `layoutAnnotations` 测试；仅 normalizeScene 不会穷举所有实际布局、材质或原生状态。
3. 提供与客户端匹配的字体时，先 `font:measure` 再重新验证；字宽变化可能让原先能放下的说明需要重新排版。
4. 在目标客户端按 [验收清单](CLIENT_ACCEPTANCE.md) 检查实际方块排列、粒子、实体、说明和完整退出。

不要直接改 `ponder.generated.json` 增添单个关键帧或时长预设。脚本、图标表和 UI 都来自构建，必须一起更新。
