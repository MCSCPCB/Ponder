# Ponder 基岩版

Ponder 是 [Java 版 Create 的 Ponder](https://github.com/Creators-of-Create/Create) 在基岩版上的复刻：玩家打开一个界面，看一段带讲解文字的方块结构演示。界面画在 Ore UI 里，以 1.26.51 为准编写。

## 安装

按 [`_sample/README.md`](_sample/README.md) 准备并核实当前最新正式版的资源后，运行 `node tools/adapter/adapt.js latest src packs/Vanilla "packs/FarmersDelightV5.0.5-26.0+"`。适配器从 `_sample/metadata/baseline.json` 读取本次核实的版本，生成实体和方块数据、更新 Ore UI 引用，并把安装包写入 `tools/output/<基岩版本>/`。`latest` 使用已核实的本地基线，不会自动下载或检查新版本；取用新版本时先更新基线。导入生成的安装包，并在世界里启用对应行为包和资源包。

`src` 自带一个望远镜的示例场景，拿着望远镜使用即可打开。适配器与实体数据的自动检查可运行 `node --test tools/adapter/adapt.test.js`，同样使用 `_sample` 当前基线。

开发验收的测试原包统一放在 [`packs/Debug`](packs/Debug/README.md)，使用适配器的 `--bundle "Ponder Debug"` 选项将主包、测试包和测试依赖合成一个 `Ponder Debug.mcaddon`。具体打包命令和本批测试入口见该目录的说明。

仓库里还有两个示例包，演示怎么给自己的附加包写思索场景：

- `packs/Vanilla`：红石灯、活塞、拉杆与按钮、中继器、比较器、漏斗，以及挖矿、骨粉、TNT。演示大部分场景指令，以及自定义粒子、实体和方块模型。

## 玩家怎么打开

- 使用一件注册过场景的物品。
- `/ponder:ponder` 打开标签索引，`/ponder:ponder index` 打开物品索引，`/ponder:ponder <物品 id>` 直接打开该物品的场景。

## 文档

- [概述](docs/overview.md)
- [入门教程：做第一个思索包](docs/getting-started.md)
- [接口参考：插件注册](docs/reference/registration.md)
- [接口参考：场景指令](docs/reference/scene.md)
- [接口参考：自定义方块、粒子与实体](docs/reference/custom-content.md)
