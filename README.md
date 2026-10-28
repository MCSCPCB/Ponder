# Ponder 基岩版

Ponder 是 [Java 版 Create 的 Ponder](https://github.com/Creators-of-Create/Create) 在基岩版上的复刻：玩家打开一个界面，看一段带讲解文字的方块结构演示。界面画在 Ore UI 里，以 1.26.51 为准编写。

## 安装

把 `src/BP` 和 `src/RP` 作为行为包和资源包启用。`src` 自带一个望远镜的示例场景，拿着望远镜使用即可打开。

仓库里还有两个示例包，演示怎么给自己的附加包写思索场景：

- `packs/Redstone`：红石灯、活塞、拉杆与按钮、中继器、比较器、漏斗。
- `packs/Gathering`：挖矿、骨粉、TNT。演示自定义粒子、实体、方块模型，以及往 `packs/Redstone` 的标签和场景里加内容。

## 玩家怎么打开

- 使用一件注册过场景的物品。
- `/ponder:ponder` 打开标签索引，`/ponder:ponder index` 打开物品索引，`/ponder:ponder <物品 id>` 直接打开该物品的场景。

## 文档

- [概述](docs/overview.md)
- [入门教程：做第一个思索包](docs/getting-started.md)
- [接口参考：插件注册](docs/reference/registration.md)
- [接口参考：场景指令](docs/reference/scene.md)
- [接口参考：自定义方块、粒子与实体](docs/reference/custom-content.md)
