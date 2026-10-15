# Ponder 基岩版复刻:现状

本文由对照 `_sample/Ponder-mc1.21.1-dev` 的 Java 源码与当前 `src/` 独立得出。
所有结论均为静态阅读与语法/JSON 解析结果,**没有在游戏内运行过**。

## 架构

- 辅助实体全部是 dummy:没有 `health`,`damage_sensor` 全免伤,无碰撞、无重力、不可推动、`persistent`;`section_block` 额外只有 `equipment` 用于手持方块。

- 玩家本体不动,自由镜头观看按玩家分配的远端舞台(真实方块)。
- 说明文字、边框、线条、图标是世界实体(伪 UI):指示线要指向世界坐标,JSON UI 取不到实时数据。
- 导航使用 ActionFormData + 手写 JSON UI(`server_form.json`)。
- 方块动画:`ponder:section_block` 静态实体,手持物品显示方块,`playanimation` + molang 驱动,上限 64 个,超出不播放动画。

## 已复刻

| Java | 基岩版 |
|---|---|
| PonderScene 时间线、关键帧、markAsFinished、nextUp | `PonderScene`、`compileSchedule`、`stateAt` |
| PonderSceneBuilder 的 world / overlay / effects / special | `PonderSceneBuilder` 同名四组 |
| 显示/隐藏/独立分段、旋转、移动、restoreBlocks | `SectionAnimator` + `section_block` 实体 |
| 旋转中心、稳定锚点(configureCenterOfRotation / configureStabilization) | geo 骨骼链 `center_in…anchor_out`,按 cell 偏移下发 |
| setBlock(s)、replaceBlocks、modify、cycle、toggleRedstonePower | 时间线 `block` 指令 |
| incrementBlockBreakingProgress 与裂纹 | `CrackAnimator` + `ponder:crack` |
| 方块破坏粒子 | `BlockDestroyEffects` + `ponder:burst` + `ponder:block_burst`(重锤式 `surface_particle_*`) |
| 文字窗口、控制提示、淡入淡出 | `TextWindowElement`、`OverlayLayout`、`OverlayRenderer` |
| 轮廓、线、值输入框、chaseBoundingBoxOutline 每 tick 逼近一半 | `outline` / `line` / `valueBox` + `chaseFrom` 插值 |
| scaleSceneView、setSceneOffsetY | 摄像机距离与焦点 |
| 平台阴影与场景结束绿色闪光、removeShadow | `PlatformShadow` + `ponder:shadow` |
| movePointOfInterest 与鹦鹉 | 真 `minecraft:parrot`,poi 每 tick 逼近 25%,`poi` / `dance` 姿态 |
| 方块实体数据(告示牌文字、容器内容) | `modifyBlockEntity` + `place` / `fill` 的 `data` |
| PonderUI 底栏、进度条、关键帧刻度、舒适阅读、重播 | `server_form.json` + `PonderForm` |
| 索引页、标签页、侧栏 | `PonderNavigation` + `server_form.json` |
| `/ponder [item]` 命令 | 自定义命令 `ponder:ponder`;无参数与 `index` 从第一个物品进入(索引页需要背后有舞台) |
| Schematic 两种来源 | `defineSchematic` 手写,`loadSchematic` 读 `.mcstructure` |
| 示例场景 | `content/DebugScenes.js`:Java `coordinateScene`(结构文件,指南针进入)、`sectionsScene`(手写方块,追溯指针进入),文字与 Java 一致 |
| 本地化 | 固定界面文字只用 Java 已有的 lang 键(`ponder.ui.*`、`ponder.ponder.shared.*`),放在 `RP/texts`;场景文字由脚本随场景注册 |

## 不实现

- 场景淡入淡出(用户确认)。
- 识别模式、编辑模式:自由相机下取不到鼠标指向(用户确认)。
- 鹦鹉的 `FaceCursorPose`:同上,需要鼠标位置,用 `poi` 姿态代替。
- 刷怪笼内的怪物等无法通过接口表达的方块实体数据:依赖世界方块本身显示(用户确认)。

## 仍有偏差或未做

- 字体宽度:ASCII 已按基岩 `default8.png` 实测校正;非 ASCII 统一按 8,无实测依据;`FONT_METRICS` 为空,字形按整格绘制。
- 文字窗口布局:用自有评分算法,未照 Java `TextWindowElement` 的 `placeNearTarget` / `independent` 公式。
- `.mcstructure` 读不出告示牌文字、箱子内容(Structure API 不暴露),需要用 `modifyBlockEntity` 手写。
- `PonderChapter`、`TemplateScenes`、`DebugInstructions` 未做。
- 示例场景只有两个,未移植 Java 其余 `DebugScenes`。
- `sectionsScene` 原结构里的 `create:copper_casing` 没有原版对应方块,用 `minecraft:copper_block` 代替。
- Java 的 `subject`、`associated`、`categories` 等索引页文字随 Java 的索引布局使用;本复刻的索引页仍是表单卡片,没有这些文字位置。
- 场景结束闪光:Java 是底板边缘的绿色渐变光,不是全屏闪光,所以没有用 `player.camera.fade`。

## 游戏内未验证的风险

- `playanimation` 对 `v.*` 的赋值是否按预期生效。
- 手持物品姿态与原版方块的对应;骨骼链在旋转中心、稳定锚点下的方向与符号。
- `query.surface_particle_*` 对舞台方块是否有效;`ponder:burst` 客户端动画是否触发粒子。
- `ponder:shadow` 的黑色渐变墙朝向与高度。
- `BlockSignComponent.setText` 与容器 `setItem` 对放置后方块是否生效。
- 真鹦鹉:`slowness` 255 能否把它钉住;`teleport` 的 `facingLocation` 是否转头。
- JSON UI 的 `'%.3s' * (...)` 嵌套绑定;分档标记与颜色码的子串歧义。
- 自定义命令 `ponder:ponder` 在当前版本能否注册。
