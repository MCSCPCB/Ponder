# 场景 API

写法与 Java Ponder 的 storyboard 一致：先声明场景世界（schematic），再用一个
`(scene, util) => { ... }` 函数按时间顺序记录指令。只有 `scene.idle()` 推进时间，其余调用都在当前 tick 发生。

场景文件放在 `src/BP/scripts/ponder/content/scenes/`，在 `content/BasePonderPlugin.js` 里注册。
示例见同目录的 `AssemblyDemo.js`。

## 注册条目

```js
export const myScene = {
  id: "my_scene",                       // [a-z][a-z0-9_]{0,47}
  schematic,                            // 对象，或返回对象的函数（读取结构文件必须用函数）
  storyboard,                           // (scene, util) => void
  title: text("中文", "English"),       // 双语，索引页使用
  itemTitle: text("木棍", "Stick"),     // 物品索引里的名字
  description: text("…", "…"),
  iconPath: "textures/items/stick",     // 沿用贴图路径，不做 item_id_aux 映射
  entryItems: ["minecraft:stick"],      // 手持这些物品使用方块进入
  tags: ["basics"],                     // 必须在 content/PonderTags.js 里存在
  order: 0,
  focus: { x: 3.5, y: 2, z: 3.5 },      // 可选，镜头聚焦点
};
```

storyboard 里的 `scene.title(id, text)` 是该场景在界面左上角显示的标题。

## 场景世界（schematic）

两种来源，产出同一结构 `{ size, blocks, air }`：

| 来源 | 用法 |
| --- | --- |
| 手写 | `defineSchematic({ size, entries, air })`，条目用 `fill(blockId, from, to, states)` 与 `place(blockId, pos, states)`；`checkerFloor(w, d)` 生成底板 |
| 结构文件 | `loadSchematic("name")`，读取 `src/BP/structures/**/name.mcstructure`，见 `docs/SCHEMATIC.md` |

`air` 列出必须保持为空气的区域；其余空位由展示区填充 15 级光源方块。
尺寸每边 1..32。

## scene（SceneBuilder）

| 方法 | 说明 |
| --- | --- |
| `title(id, title)` | 场景标题 |
| `configureBasePlate(xOffset, zOffset, size)` | 底板范围，默认铺满 |
| `showBasePlate()` | 15 tick 从上方淡入底板层（y = 0） |
| `idle(ticks)` / `idleSeconds(s)` | 唯一推进时间的调用 |
| `addKeyframe()` / `addLazyKeyframe()` | 记录关键帧；lazy 晚 6 tick，让前面的文字读完 |
| `markAsFinished()` | 结束进度条计入的时间，之后的内容只作收尾 |
| `rotateCameraY(degrees)` | 相对旋转镜头，20 tick |
| `setNextUpEnabled(bool)` | 是否显示“下一个场景”提示 |
| `world()` / `overlay()` / `effects()` / `special()` | 见下 |

没有对应实现的 Java 方法：`scaleSceneView`、`setSceneOffsetY`（只记录，不影响镜头）、`removeShadow`（无对应画面）。

## util

`util.select()`：`everywhere`、`position`、`fromTo`、`column`、`layer`、`layersFrom`、`layers`、`cuboid`。
`util.vector()`：`centerOf`、`topOf`、`blockSurface`、`of`。`util.grid()`：`at`、`zero`。

方向参数使用字符串：`"up" "down" "north" "south" "east" "west"`。

## world()

区域的显示与隐藏会播放 15 tick 的滑入/淡出，由方块实体承担，真实方块在动画结束后才写入世界。
实体预算有限（`LIMITS.stageEntities`），超出时该批方块直接以真实方块出现，不播动画。

| 方法 | 说明 |
| --- | --- |
| `showSection(sel, dir)` / `hideSection(sel, dir)` | 显示 / 隐藏选区 |
| `showSectionAndMerge`、`glueBlockOnto` | 并入已有的独立区域 |
| `showIndependentSection(sel, dir)` → link | 独立区域，可单独旋转和移动 |
| `showIndependentSectionImmediately(sel)` | 立即显示的独立区域 |
| `hideIndependentSection(link, dir)` | 隐藏独立区域 |
| `makeSectionIndependent(sel)` | 把已显示的部分变成独立区域 |
| `rotateSection(link, x, y, z, ticks)` / `moveSection(link, offset, ticks)` | 区域动画，线性 |
| `configureCenterOfRotation(link, v)` | 旋转中心 |
| `setBlock(pos, block, particles)` / `setBlocks` / `replaceBlocks` / `destroyBlock` | `block` 形如 `{ blockId, states }` |
| `modifyBlock(pos, states)` / `modifyBlocks` / `cycleBlockProperty` / `toggleRedstonePower` | 改状态 |
| `restoreBlocks(sel)` | 恢复为 schematic 里的原始方块 |
| `createEntity` / `createItemEntity` / `modifyEntity` | 教学实体 |

回退采用重放脚本定义的状态，不会倒放原生红石、水流、生物 AI。

## overlay()

| 方法 | 说明 |
| --- | --- |
| `showText(ticks)` | 返回文字构建器：`.text(t)` `.colored(c)` `.pointAt(v)` `.placeNearTarget()` `.independent(y)` `.attachKeyFrame()` |
| `showOutlineWithText(sel, ticks)` | 轮廓加文字 |
| `showControls(location, pointing, ticks)` | 返回：`.rightClick()` `.leftClick()` `.scroll()` `.withItem(id)` `.showing(iconPath)` `.whileSneaking()` `.whileCTRL()` |
| `showOutline(color, slot, sel, ticks)` / `chaseBoundingBoxOutline(color, slot, box, ticks)` | 轮廓框 |
| `showLine` / `showBigLine` | 线宽 1/16 / 1/8 |
| `showScrollInput` / `showCenteredScrollInput` / `showRepeaterScrollInput` / `showFilterSlotInput` | 值输入框：首 tick 是点，随后膨胀到固定大小 |

文字窗口前后各有 5 tick 的淡入淡出，总时长是 `ticks + 10`。颜色：`white black red green blue slow medium fast input output`，或 `0xRRGGBB`。

## effects() / special()

`emitParticles`、`simpleParticleEmitter`、`particleEmitterWithinBlockSpace`、`indicateRedstone`、`indicateSuccess`。
`createCart`、`createBirb`、`moveCart`、`moveParrot`、`rotateCart`、`hideElement`。鹦鹉的姿势和注视点没有对应实现。

## 不支持

- 鼠标拾取与 Identify 模式、编辑器视图、复制坐标。
- 方块实体 NBT 修改、破坏进度裂纹。
- 独立区域超过实体预算时不播动画。
