# Ponder 基岩版

Ponder 是 [Java 版 Create 的 Ponder](https://github.com/Creators-of-Create/Create) 在基岩版上的复刻：玩家打开一个界面，看一段带讲解文字的方块结构演示。界面画在 Ore UI 里，以 1.26.51 为准编写，当前使用和实机验收的是适配器产出的 1.26.60.4 包。

## 安装

按下面的[构建与资料](#构建与资料)准备资料并运行适配器。导入 `tools/output/1.26.60.4/` 中的 Ponder 与 Vanilla Ponder 两个 `.mcaddon`，启用行为包、资源包和测试版 API。适配器会生成源码中未携带的原版方块、实体数据表。`src` 自带一个望远镜的示例场景，拿着望远镜使用即可打开。

仓库里还有两个示例包，演示怎么给自己的附加包写思索场景：

- `packs/Vanilla`：红石灯、活塞、拉杆与按钮、中继器、比较器、漏斗，以及挖矿、骨粉、TNT。纸对应五页渲染演示，集中展示方块实体、船、装备、物品和粒子；拴绳保留实体、床、旗帜和水的场景。
- `packs/FarmersDelightV5.0.5-26.0+`：农夫乐事的附属包场景，随适配器处理自定义方块模型和原版贴图引用。

## 玩家怎么打开

- 使用一件注册过场景的物品。
- `/ponder:ponder` 打开标签索引，`/ponder:ponder index` 打开物品索引，`/ponder:ponder <物品 id>` 直接打开该物品的场景。

## 构建与资料

普通构建只需要 Node.js。源码以 1.26.51 为底板，目标版本接口由适配器转换；当前构建和实机验收使用 1.26.60.4。

```text
tools/
  adapter/          正式适配器及其调用的模块
  data/             构建必需的固定数据、来源说明和许可证
  input/            需要适配的外部包
  version/
    common/         一个当前 Android APK，也可以直接改名为 .zip
    1.26.51/
      gui/dist/hbui/...
      scaffold/...
    1.26.60.4/
      gui/dist/hbui/...
      scaffold/...
  output/
    1.26.60.4/       当前交付包
```

每个版本只保留自己的 Ore UI `gui/` 和 Scaffold 数据。`scaffold/` 放入 `block_definition.json`、`block_geometry.json`、`block_rotation.json`、`state_rotations.json`、`dust_connections.json` 及其 `LICENSE`。`common/` 中的 APK 提供共享原版资源与行为层，不再为每个版本复制资源包，也不需要单独准备 1.26.51 完整安装包。

共享 APK 支持 `.apk` 或直接改名的 `.zip`，不能再套一层压缩包；有多个候选时构建报错。适配器读取 `assets/assets/resource_packs/` 和 `behavior_packs/`，也支持少一层 `assets/` 的布局及 `__brarchive` 版本 1，按数字顺序合并不晚于目标版本的 `vanilla*` 层。1.26.51 截至 `vanilla_1.26.50`，1.26.60.4 截至 `vanilla_1.26.60`。共享 APK 需保有这些层，版本目录名不能恢复已被替换的历史文件。

从仓库根目录运行：

```powershell
node tools/adapter/adapt.js 1.26.60.4 src packs/Vanilla
```

可在命令末尾加入 `'packs/FarmersDelightV5.0.5-26.0+'`，一并适配农夫乐事示例。也可把待适配的包放进 `tools/input/`，只传目标版本号。每次构建按源清单的版本号递增一个补丁号。

APK 不提供完整的运行时状态注册表；适配器另读 `tools/data/bedrock-samples/1.26.50.4/` 的底板注册资料、[基岩物品资料](tools/data/bedrock-1.26.51/README.md)和 [Java 结构与渲染参考数据](tools/data/java-1.21.1/README.md)。这些固定数据属于构建输入，需连同来源说明和许可证一起保留。

本地开发材料统一放在已被 Git 忽略的 `_stash/`：`tests/` 放离线测试，`research/` 放研究和数据生成脚本，`cache/` 放下载缓存与分析依赖，`reports/` 放日志、图片及验收记录，`archive/` 放旧包和源码快照。`tools/output/` 只放当前交付包；普通构建不依赖 `_stash/`。`_sample/` 保留参考项目，`tools/version/` 保留本机准备的版本资料。

## 文档

- [概述](docs/overview.md)
- [入门教程：做第一个思索包](docs/getting-started.md)
- [接口参考：插件注册](docs/reference/registration.md)
- [接口参考：场景指令](docs/reference/scene.md)
- [接口参考：自定义方块、粒子与实体](docs/reference/custom-content.md)
