# 基岩物品资料

`items.json` 来自 [PrismarineJS minecraft-data 的基岩 1.26.51 物品表](https://github.com/PrismarineJS/minecraft-data/blob/bd8b5c6048e5af9694374b83f25f5b4aade619cc/data/bedrock/1.26.51/items.json)，固定提交 `bd8b5c6048e5af9694374b83f25f5b4aade619cc`，SHA-256 为 `e02c5d3ccac461d6f5d85ddb91e49a5e6616b95d34dd7fd4e57ccfa4fe058c8d`。上游 README 声明 MIT，说明随本目录保存。适配器只输出底板官方物品注册表中的标识符，读取堆叠上限、耐久和数据驱动物品的伤害，原始网络 NBT 不随包交付。

`tools/adapter/item-data.js` 保存原版硬编码工具的额外攻击伤害、附魔语言键和基岩药水时长。攻击伤害显示武器相对徒手增加的数值，锋利每级增加 1.25；不显示 Java 攻击速度、装备栏属性组和护甲属性行。喷溅、滞留和药箭的时长分别乘 3/4、1/4 和 1/8。基岩长效再生和剧毒是 120 秒，强效是 22 秒；凋零药水是凋零 II、40 秒。药水属性附加行和全部特殊物品信息仍需完整核对，不能据此勾选整个物品提示 TODO。

稀有度及附魔后的颜色提升依据 [Bedrock 1.21.30 官方更新说明](https://www.minecraft.net/en-us/article/minecraft-1-21-30-bedrock-changelog) 的 Rarity 和 Vanilla Parity 部分。该更新将金苹果改为普通、附魔金苹果改为稀有、鞘翅与龙首改为史诗；稀有度不是按物品是否发出附魔光效推断。

提示语直接使用游戏的基岩语言键，不打包 Java 的原版翻译。本机的 `_stash/tests/fixtures/bedrock-items.en_US.json` 是共享 1.26.60.4 APK 中英文语言文件的物品相关测试样本，仅用于离线核对语言键，不随仓库或资源包交付，内容属于 Mojang Studios。它验证目标端现有键，不能单独证明所有 1.26.51 行为或提示语义。
