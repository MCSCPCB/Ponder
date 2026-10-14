# 原生正交视角核验

核验日期：2026-10-14。仅阅读公开文档与作者代码，未修改玩法代码、未运行 Minecraft 客户端。

## 当前状态：按用户确认关闭

2026-10-14 用户说明，其先前所指的正交视角与鼠标互动属于官方 camera 配置中的能力，但依赖玩家本体，不能用于本项目的远端展示计划。因此不再调查该正交方案、不再索例，也不改变玩家原地的既定架构。
这是项目范围决策，不是“基岩版不存在正交能力”的结论。以下保留此前调查记录；其中未定位实例的状态不再代表当前有待完成的任务。

## 此前目标与证据边界

- 用户指出基岩版已有原生正交视角实例，要求查找并核验接入方式。
- 本轮尚未定位到可确认用于真实世界场景的原生正交投影实例或配置。
- “未找到”不等于“不支持”。不以文档未提及为否定证据，也不擅自采用“小 FOV＋远相机”的透视近似。
- 核验时区分相机观察角度与投影方式；项目名含 Isometric 不足以证明采用正交投影。

## 已核对的原始资料

### Blobicycake / Isometric-Minecraft

作者仓库的 `Isometric BP/functions/isometric/camera.mcfunction`：
`https://github.com/Blobicycake/Isometric-Minecraft/blob/main/Isometric%20BP/functions/isometric/camera.mcfunction`

- 实际通过 `camera ... set minecraft:free` 设置相对玩家的斜向位置，再用 `facing` 朝向玩家。
- 普通状态相对坐标为 `(20, 20, 20)`，缩放状态为 `(5, 5, 5)`；另有对应反向观察位置。
- 该文件没有切换为正交投影的设置；只能作为自由相机斜向观察的实例，不能作为原生正交投影的证据。
- 仓库文件树包含函数、物品与资源包；未见自定义相机预设文件。核对的是当日 `main` 分支，未在游戏中验证效果。

### Microsoft Learn：Camera 类（实验视图）

`https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/camera?view=minecraft-bedrock-experimental`

- 所读页面标注更新于 2026-09-16，列出 `setCamera`、`setDefaultCamera`、`setCameraWithEase`、`setFov` 等方法。
- `setCamera` 接受 JSON 相机预设标识。该页没有给出正交投影的调用方法，但不能据此推断其他机制不存在。

### Microsoft Learn：相机系统与命令

`https://learn.microsoft.com/en-us/minecraft/creator/documents/CameraSystem/CameraCommandIntroduction?view=minecraft-bedrock-stable`

`https://learn.microsoft.com/en-us/minecraft/creator/commands/commands/camera?view=minecraft-bedrock-stable`

- 已核对自由相机、自定义预设及命令入口；所读资料未提供足以确认目标正交实例的证据。
- 系统介绍页比 Camera 类文档旧，不将其预设列表视为所有当前能力的完整清单。

## 后续

- 当前已按用户确认结束此项调查，不再把实例定位列作阻塞；结束调查不等于已实现正交相机。
- 使用常规自由相机与相机构图，不承诺正交投影等价，也不将小 FOV 透视近似称为原生正交。
- 已排除物品数值 ID 映射、实体文字与 GUI 尺寸联动等调查分支，不借本次相机核验重新扩大范围。
