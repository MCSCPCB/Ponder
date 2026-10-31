# Java 结构的方块映射

本目录还保存客户端渲染参考数据 `client.json`，来自 Mojang 官方 Java 1.21.1 客户端，包含物品落地变换、选定的物品分层、粒子帧、烟花染料颜色和方块状态光照。基岩版已有相同像素的物品层和粒子帧直接引用原版文件或图集区域；新增的 78 张粒子图中，70 张使用原版引用，8 张保留 Java 图。`src/RP/hbui/ponder/assets/items/` 和 `particles/` 中的这些素材属于 Mojang Studios，不能套用此目录的 MIT 映射许可证。物品默认属性和提示信息使用 [基岩版资料](../bedrock-1.26.51/README.md)，不打包 Java 原版翻译。

本机的重建脚本归档在 `_stash/research/generation/`，不随仓库分发。运行 `node _stash/research/generation/generate-client-data.js` 可重建客户端数据，需要 Java 21 或更新版本及 `tools/version/common/` 的共享 APK。脚本使用固定的 1.21.1 版本描述、官方 mappings 和客户端，验证官方 SHA-1 后在 `_stash/cache/java-reference/` 缓存，并用基岩底板资源匹配相同的粒子图；普通适配构建直接读取已生成文件，不需要 Java。客户端 SHA-1 为 `30c73b1c5da787909b2f73340419fdf13b9def88`，mappings 为 `2244b6f072256667bcd9a73df124d6c58de77992`，版本描述为 `018296bcb207bea6fd25b05f08eee3942dcec406`。

`blocks.json` 用于将 Java 1.21.1 结构转换为本项目的基岩 1.26.51 底板状态。1060 个方块、26684 个 Java 状态；`blocks` 记录属性顺序和默认值，`palette` 记录对应的基岩状态、含水层及颜色。它只在适配器中使用，不随包加载到界面。

来源：

- [PrismarineJS minecraft-data 的 1.21.1 方块表](https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/1.21.1/blocks.json)，Git blob `9d8c578f6584e17c6618b03501e605684f26911a`。项目 README 声明 MIT，随本目录保存其说明。
- [GeyserMC mappings](https://github.com/GeyserMC/mappings/tree/698fd2b108a9e53f1e47b8cfdc122651b70d6059) 的 `blocks.nbt`，Git blob `5e9838b3eff0c8532e83b382aaf432e694aed4f2`，许可证见 `Geyser-LICENSE.txt`。
- 本项目 `tools/data/bedrock-samples/1.26.50.4/mojang-blocks.json` 的底板方块和属性域。

生成时按 Java 状态顺序展开 Geyser 映射，对照底板注册资料生成当前名称：独立的墙、海绵、去皮木、头颅、紫珀柱和铁链；门与栅栏门使用 `minecraft:cardinal_direction`；楼梯保留 `minecraft:corner`。水层、床和旗帜颜色及头颅旋转单独保存。`moving_block` 和 `end_gateway` 是内部方块，官方可用方块注册表没有列出，保留映射标识，不替换成空气。

适配器接收同目录下的 `.nbt` 或 `.mcstructure`；同名文件同时存在会报错。Java 的多调色板结构固定取第一组。没有对应映射的模组方块、未知状态和图案会明确报出文件与标识，作者需先用基岩方块替换；不猜测模组之间的对应关系。Java NBT 原文保存在 `PonderJavaData`，供方块实体接口读写；结构中附带的世界实体与基岩结构一样不自动生成，场景通过实体指令控制它们。
