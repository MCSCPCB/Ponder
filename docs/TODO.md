# Ponder 待办

目标：把 `_sample/Ponder-mc1.21.1-dev` 完整复刻到基岩版。基线 UI 是 `b444277`，坐标以它为准，缺的元素按 Java 补。

**没有任何一项经过实机验证。** `[x]` 只表示代码已写完，且静态检查（import 能解析、JSON 能解析、场景时间轴可重放）通过；
`[ ]` 表示没写或写了但行为有已知缺口。验证见 `CLIENT_ACCEPTANCE.md`。

## 架构

- [x] 按 Java 包结构整理：`api` / `foundation`（`element` `instruction` `level` `registration` `ui`）/ `content` / `enums`。
- [x] 场景 = schematic + storyboard，写法与 Java `SceneBuilder` 同形（`docs/SCENE_API.md`）。
- [x] schematic 两种来源：手写 `defineSchematic`，读取 `.mcstructure` 的 `loadSchematic`（未用结构文件验证）。
- [x] 时间轴是纯函数重放 `stateAt`，任意 tick 可跳转；`markAsFinished` 区分计入时间和收尾。
- [x] 仓库只含 `src/` 和 `docs/`，没有构建、没有测试、没有生成器。UI JSON 手写维护。

## 世界渲染

- [x] 自由相机看远端展示区；展示区分配、黑色混凝土外壳、15 级光源、常加载区、journal 恢复（沿用上一轮，未改逻辑）。
- [x] 区域淡入/淡出/移动/旋转：方块实体不动，`playanimation` 写 molang 变量驱动（`SectionAnimator` + `ponder:section_block`）。
- [ ] 淡入用“缩放加滑入”代替透明度（手持物品无逐实体 alpha）；效果待看。
- [ ] 手持方块的朝向和偏移校准（`v.cal_*` 沿用 LordPhysics 的数值，未必适合这个几何）。
- [ ] 动画预算用尽时的回退：直接出现真实方块，没有提示。
- [ ] 独立区域的旋转中心 `configureCenterOfRotation` 已记录但动画里未使用，目前绕区域中心。
- [ ] `configureStabilization`、`makeSectionIndependent` 的稳定锚点未实现。
- [ ] 教学实体的移动/旋转（`moveCart` 等）只在重放时改位置，没有平滑插值。
- [ ] `incrementBlockBreakingProgress` 无渲染。
- [ ] 方块破坏粒子（`setBlock(..., true)` 的 `particles` 参数）只记录，未播放。

## 标注

- [x] 文字、说明框、指示线、轮廓框、线、值输入框；文字窗口前后各 5 tick 淡入淡出。
- [x] 值输入框首 tick 是点，随后膨胀到 Java 规定的大小，线宽 1/15。
- [x] 操作提示：图标、物品图标、潜行/Ctrl 前缀。
- [ ] `chaseBoundingBoxOutline` 只画目标框，没有平滑追逐。
- [ ] `showText.independent(y)` 与 `placeNearTarget` 只记录字段，布局仍是自动。
- [ ] `showControls` 的 `pointing` 滑入偏移（Java：沿朝向 10px × (1−fade)）未做。
- [ ] 世界文字字距是估算宽度，需要和目标字体对照。
- [ ] 物品图标贴图表 `ICON_PATHS` 是固定列表，新增图标要同时改实体和渲染控制器。

## UI

- [x] `server_form.json` 手写：头部、侧栏、底部按钮、进度条（4/8/12/16/24 档）、说明气泡、“下一个场景”提示、索引页。
- [x] 关键帧刻度位置用文本传值（sample 成就 UI 的 `property_bag` 加 `%.Ns` 截取），按真实时间比例摆放。
- [x] 不重开表单：进度条和气泡只在点击后刷新（已与用户确认）。
- [ ] 头部图标框 38×38、图标 32×32、拖尾随文字宽度变化：仍沿用基线 40×40 / 24×24 / 固定 204×42。
- [ ] 侧栏悬停条宽度固定 200，没有随文字长度变化。
- [ ] 舒适阅读按钮的按下状态只靠重开表单刷新。
- [ ] 快捷键字样、悬停提示文字（Previous Scene 等）、返回按钮的面包屑箭头。
- [ ] 播完后按钮闪烁的 `finishingFlash`。
- [ ] 索引页的分类标题条、页码文字（Java：Page n/m 缩放 1.5）。
- [ ] 标签页（`PonderTagScreen`）：主物品行、描述框。
- [ ] 切换场景的标题翻转：用淡入淡出近似，不做 3D 翻转。

## 内容

- [x] 三个 demo 改写成 storyboard：`assembly_demo`、`forge_demo`、`redstone_lamp_demo` / `lamp_states`。
- [ ] 用 `.mcstructure` 做一个结构式 demo（等用户提供结构文件）。
- [ ] 移植 Java `TemplateScenes` / `DebugScenes` 作为对照场景。

## 不做

- 正交视角、鼠标拖拽旋转、世界拾取和 Identify 模式、编辑器视图、复制坐标。
- 原生红石、水流、生物 AI 的暂停/倒退。
- 方块实体 NBT 修改。
- 屏幕缩放过渡和场景水平滑移（沿用淡入加位移）。
