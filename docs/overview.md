# Ponder 基岩版概述

Ponder 是 Java 版 [Create](https://github.com/Creators-of-Create/Create) 的思索界面在基岩版上的复刻。玩家对一件物品打开思索，就能看一段方块结构的动画演示，旁边配有讲解文字。

## 它能做什么

- 为任意物品注册一个或多个场景。场景是一段脚本，控制方块的出现、移动、替换，以及文字、描边、粒子和掉落物。
- 用标签把相关物品归类。标签显示在标签索引和场景的“关联词条”里。
- 多个包可以同时往 Ponder 里加内容。一件物品可以同时拥有几个包的场景，一个包也可以把物品加进别的包的标签。

## 工作方式

Ponder 本身是一对行为包和资源包。界面画在资源包的 Ore UI（`hbui/gameplay.html`）里，以 1.26.51 为准编写。

你的内容也是一对行为包和资源包：

- **行为包**在世界加载后发一条 `ponder:register` 脚本事件，告诉 Ponder 你的插件脚本在哪、哪些物品能打开思索。
- **资源包**里放插件脚本 `plugin.js`、翻译文件，以及可选的结构文件和贴图。

玩家打开思索时，Ponder 载入所有报到过的插件脚本，再显示界面。插件脚本的写法对应 Java 版的 `PonderPlugin`，场景脚本对应 `SceneBuilder`。如果你写过 Java 版的思索，大部分代码可以照搬。

## 玩家怎么打开

- 使用一件注册过场景的物品。
- `/ponder:ponder` 打开标签索引，`/ponder:ponder index` 打开物品索引，`/ponder:ponder <物品 id>` 直接打开该物品的场景。

## 示例

仓库里有四份可以直接启用的示例：

| 位置 | 内容 |
| --- | --- |
| `src` | Ponder 本体，自带一个望远镜场景（Java 版的调试场景 1） |
| `packs/Redstone` | 红石灯、活塞、拉杆与按钮、中继器、比较器、漏斗。演示大部分场景指令 |
| `packs/Gathering` | 挖矿、骨粉、TNT。演示自定义粒子、实体和方块模型，以及往 `packs/Redstone` 的标签和场景里加内容 |
| `packs/FarmersDelightV5.0.5-26.0+` | 农夫乐事（GPL-3.0）加一个厨锅场景。演示附属包自己的方块经适配器后自动画出 |

## 与 Java 版的差异

- **方块外形**。原版方块按游戏里的外形画，随方块状态变；附属包自己的方块经适配器后按它的模型画。草、树叶、藤蔓、水这类按生物群系染色的贴图按平原的颜色染（Java 版思索的世界也是平原）。水和岩浆照 Java 版的画法：水面高度随液位和周围的水变，流动时贴图顺着流向；水贴着玻璃、冰、树叶的那一面用一张单色的 water_overlay（基岩版没有这张图，主包自带）；含水方块里的水也画。床和旗帜照 Java 版的模型画在原版实体贴图上，颜色和图案取方块实体数据，旗帜会摆动。
- **方块 id**。用基岩版的 id 和方块状态，例如 Java 的 `snow_block` 在基岩版是 `minecraft:snow`。
- **实体**。内置的只有掉落物，其他实体要自己写渲染，见[自定义方块、粒子与实体](reference/custom-content.md)。
- **结构文件**。只读基岩版的小端 `.mcstructure`，不读 Java 版的 `.nbt`。
- **字体**。沿用原版 Ore UI 的字体，汉字是 Noto Sans，字母和数字是 Minecraft 像素字体。

## 致谢

原版方块的外形取自 [Scaffold](https://github.com/EvilSlimeLabs/Scaffold) 的外形表（MIT 许可）。适配器把它转换进主包的 `hbui/ponder/blocks/vanilla_blocks.json`，许可声明放在同目录的 `vanilla_shapes_LICENSE.txt`。

## 下一步

- [入门教程：做第一个思索包](getting-started.md)
- [接口参考：插件注册](reference/registration.md)
- [接口参考：场景指令](reference/scene.md)
- [接口参考：自定义方块、粒子与实体](reference/custom-content.md)
