# 鼠标交互核验

核验日期：2026-10-14。仅阅读项目源码、官方资料与实例作者公开的代码；未修改玩法代码，未运行 Minecraft 客户端。

## 当前状态：按用户确认关闭

2026-10-14 用户说明，其先前所指的正交视角与鼠标互动属于官方 camera 配置中的能力，但依赖玩家本体，不适用于本项目。因此停止当前世界场景鼠标互动的接入调查，不做拖拽旋转、悬停识别及拾取，不再索例或开展相关原型。
普通 JSON UI 按钮的点击、悬停和按钮驱动的关键帧跳转仍保留。该范围决定不是“基岩版没有鼠标互动能力”的结论。以下为此前核验的历史资料。

## 此前调查结论

- 不能再笼统认定“基岩版／JSON UI 不支持鼠标互动”：现有项目已经配置 UI 本地拖动绑定，官方也有鼠标指向控制方案，另有作者公开的固定相机交互实例。
- 必须区分 UI 本地拖动量、系统光标的绝对屏幕坐标、玩家视线及世界射线；它们不是同一种数据。
- 尚未证明这些机制能同时满足本项目的“玩家本体原地＋远端自由相机＋JSON UI 表单保持打开”。
- 当前架构仍为按钮响应后由脚本重建表单。调查结束前，鼠标拖拽旋转、场景悬停识别是否实施尚未决定；最新范围决定见本页顶部，不再将它们列为待定项。

## 1. 当前项目已有的 UI 拖动绑定

文件：`D:\MINECRAFT\Project\Ponder\src\RP\ui\server_form.json`

- 696–712 行：从 `$gesture_source_control` 绑定 `#gesture_delta_source`、`#gesture_mouse_delta_x` 和 `#gesture_mouse_delta_y`。
- 736–750 行：`input_panel` 使用 `gesture_tracking_button: "button.turn_structure"`，将 `button.menu_select` 映射为拖动动作。
- 这些绑定位于旧结构预览渲染器的控制链路中，不是 Script API 回调。
- 证据边界：确认的是源码中已有这条 UI 本地链路；本轮没有重新进行客户端拖动测试，也没有证明移除旧渲染器后可以直接控制世界相机。

文件：`D:\MINECRAFT\Project\Ponder\src\BP\scripts\ponder\runtime.js`

- 734、738 行：显示表单并等待响应。
- 744 行：通过 `currentFormState.buttons[result.selection]?.id` 取按钮操作。
- 768–769 行：重建并再次显示表单。
- 此处没有接收连续拖动量或鼠标坐标的逻辑。不能把 UI 已有绑定等同于脚本已能收到数据。

## 2. 官方原生鼠标指向控制

官方 Control Schemes：
`https://learn.microsoft.com/en-us/minecraft/creator/documents/controlschemes?view=minecraft-bedrock-stable`

- `camera_relative_strafe` 的键鼠说明明确写出角色朝屏幕鼠标位置转向。
- 允许列表包括 `minecraft:free`；可以通过相机预设的 `control_scheme` 字段关联控制方案。
- 预设字段值为 `camera_relative_strafe`，不是 `minecraft:camera_relative_strafe`。
- 这证明引擎有鼠标指向控制能力，不证明脚本能读取屏幕 `(x, y)`，也不证明它在表单占用焦点时仍更新角色朝向。

版本边界：

- 上述 Learn 页面标注更新于 2025-05-27，仍把该方案标为实验性。
- 1.21.90 正式更新说明明确 `/controlscheme` 命令本身不再要求实验性相机开关；这句话不能自动扩大为所有控制方案均已脱离实验。
  `https://feedback.minecraft.net/hc/en-us/articles/37393460002957-Minecraft-Bedrock-Edition-1-21-90-Chase-the-Skies`
- 更晚的 1.21.111 正式更新说明记载：自 1.21.110 起，自由相机与 fixed boom 相机默认使用 Camera Relative Strafe。因此不能把旧 Learn 页面的默认方案说明直接当作当前行为。
  `https://www.minecraft.net/en-us/article/the-copper-age---minecraft--bedrock-edition-1-21-111-changelog`
- 目标版本、预设继承及世界设置下的实际表现仍待客户端原型确认。保留用户已经验证的 `alpha` 模块／成就结论，不借此重新质疑它，也不由它推断所有功能开关均可绕过。

## 3. 实际案例：基岩版音乐编辑器

作者原帖：Fun_Paint3693，I made a DAW in minecraft. (Bedrock)。
`https://www.reddit.com/r/MinecraftCommands/comments/1wf8ggk/i_made_a_daw_in_minecraft_bedrock/`

检索到的原帖及评论记录分别发表于 2026-09-13、2026-09-14。作者说明使用 Bedrock Script API，并在评论中公开固定相机与射线的核心代码；这不等于已取得整个项目源码或世界包。

- 作者的自定义 `/controlmode` 会定位相机、传送玩家并禁用移动；此命令不是原生命令。
- 公开片段循环设置 `minecraft:free`，相机位置为 `(-20, -44, 31)`，朝向 `(0, -44, 31)`；玩家仍可改变视线，相机保持固定。
- 鼠标交互读取玩家头部位置和视线：

```js
dimension.getBlockFromRay(player.getHeadLocation(), player.getViewDirection())?.faceLocation;
```

- 这是以玩家头部为起点的方块射线结果，不是直接获取系统鼠标的屏幕像素坐标。
- 原例包含玩家传送，但不能由此断言所有类似方案都必须传送玩家。适配本项目需另行校验远端相机的射线起点、方向映射及输入焦点。
- 未找到该实例在保持打开的 JSON UI 表单上同时接收世界鼠标输入的证明，不能宣称已经兼容本项目架构。

## 4. 脚本接口与 Editor 的边界

ActionFormResponse：
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/actionformresponse?view=minecraft-bedrock-stable`

- `selection` 返回被点击按钮的索引，与本项目现有响应方式一致，不是连续拖动事件。

InputInfo：
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/inputinfo?view=minecraft-bedrock-experimental`

- 所读页面列有输入模式、按键状态与移动向量，没有列出鼠标屏幕坐标读取方法；不能把 `getMovementVector()` 当作鼠标位置。
- 文档未列出直接接口，不构成“所有间接实现都不存在”的证明。

Editor Cursor／MouseRayCastAction：
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-editor/cursor?view=minecraft-bedrock-experimental`
`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-editor/mouseraycastaction?view=minecraft-bedrock-experimental`

- 官方明确描述了编辑器的屏幕鼠标到世界射线能力，但这些属于 `@minecraft/server-editor`，不能据此证明普通 addon 的脚本具有相同接口。
- 网易 ModSDK 的例子也须单独判断，不能直接当作普通国际版 addon 的能力证据。

## 5. 历史未验证边界（不再作为当前待办）

此前没有验证以下条件；按用户最新决定，不再继续研究或索要对应实例：

1. 表单保持打开时，能否持续获得可供脚本使用的拖动量／指向数据；若只能点击后返回，明确其非连续边界。
2. 原生控制方案或视线映射在玩家原地、相机远端时是否仍有正确且稳定的含义；不能直接把 `player.getViewDirection()` 当作远端相机的鼠标射线。
3. 表单关闭／打开、相机近处／远处的输入及命中对照，以及该特殊控制方案的退出恢复。

正交调查同样已按用户确认关闭，见 `D:\MINECRAFT\Project\Ponder\.codex\CAMERA_RESEARCH.md`。后续只在用户主动重新变更范围时再评估，不因读取历史笔记自动重开这两项调查。
