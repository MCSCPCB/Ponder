# 接口参考：插件注册

插件脚本里通过 `window.Ponder`（下文写作 `P`）注册内容。写法对应 Java 版的 `PonderPlugin`。

## 报到消息

行为包发出的 `ponder:register` 脚本事件，消息是一段 JSON：

| 字段 | 说明 |
| --- | --- |
| `modId` | 插件命名空间，和 `P.addPlugin` 的 `getModId()` 一致 |
| `script` | 插件脚本在资源包 `hbui/` 下的路径 |
| `items` | 使用后打开思索的物品 id |

Ponder 每次打开时载入还没载入过的插件脚本。同一个 `modId` 再次报到会覆盖上一次的内容。

## P.addPlugin

```js
P.addPlugin({
  getModId() { return "my_mod"; },
  name: "My Mod",
  registerScenes(helper) { },
  registerTags(helper) { },
  registerSharedText(helper) { },
  indexExclusions(helper) { },
});
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `getModId()` | 是 | 命名空间。翻译键、结构路径、标签 id、场景 id 都以它开头 |
| `name` | 否 | 标签索引里的分组名，默认是 `getModId()` 的返回值 |
| `registerScenes` | 否 | 注册场景 |
| `registerTags` | 否 | 注册标签 |
| `registerSharedText` | 否 | 注册共享文本 |
| `indexExclusions` | 否 | 不在物品索引里列出的物品 |

## 注册场景

### helper.addStoryBoard

```js
helper.addStoryBoard(物品, 结构, 场景函数, ...标签)
```

给一件物品注册一个场景，返回场景条目。

### helper.forComponents

```js
helper.forComponents(物品1, 物品2, ...)
  .addStoryBoard(结构, 场景函数, ...标签)
  .addStoryBoard(结构, 场景函数2, ...标签);
```

给几件物品注册同一组场景。最后一个参数可以换成函数，它对每件物品的场景条目各调用一次：

```js
.addStoryBoard(结构, 场景函数, entry => entry.highlightTag("redstone").orderAfter("other_scene"))
```

### 场景条目

| 方法 | 说明 |
| --- | --- |
| `highlightTag(标签)` | 场景里高亮这个标签 |
| `highlightTags(标签, ...)` | 高亮多个标签 |
| `highlightAllTags()` | 高亮这件物品的所有标签 |
| `orderBefore(场景 id)` | 排在同一物品的另一个场景之前 |
| `orderAfter(场景 id)` | 排在之后 |

标签不带冒号时属于本插件，带冒号时是完整 id，例如 `"vanilla:redstone"`。

`orderBefore` 和 `orderAfter` 给一个参数时指本插件的场景，给两个参数时是 `(命名空间, 场景 id)`，用来排到别的插件的场景前后。场景 id 是场景函数里 `scene.title` 的第一个参数。没有排序要求的场景按注册顺序排列。

### 结构

结构决定场景的大小和初始方块，有两种写法。

脚本里写：

```js
const schematic = {
  size: { x: 5, y: 3, z: 5 },
  fill(world) {
    world.setBlock(2, 1, 2, "minecraft:redstone_lamp");
    world.setBlock(1, 1, 2, P.block("minecraft:lever", { lever_direction: "up_north_south", open_bit: false }));
  },
};
```

结构文件放在 `hbui/ponder_addons/<modId>/structures/` 下，传去掉后缀的路径，例如 `"basics/plate"`。适配器接收基岩小端 `.mcstructure` 和 Java 1.21.1 大端 `.nbt`（含 gzip），将 Java 方块、状态、含水层和方块实体转为底板数据。未知映射会报出文件与标识；同名的两种结构不能同时存在。多调色板取第一组，结构里的世界实体由场景指令生成。来源和重建方式见 `tools/data/java-1.21.1/README.md`。

Java 的 `.nbt` 只提供结构数据，Java 模组的思索场景函数还会调用 Minecraft 和模组自己的类。仅有方块 id、状态对应关系，不能直接运行这些 Java 场景。当前结构映射覆盖 Java 1.21.1 原版方块，未知模组方块仍会报错；场景逻辑需要用本文和场景接口里的 JavaScript 写法移植。通用 Java 场景直接运行属于可选范围，当前没有提供 Java 编译器、运行时或任意模组的自动适配。

坐标系与游戏相同：`x` 向东，`y` 向上，`z` 向南。

## 注册标签

```js
registerTags(helper) {
  helper.registerTag("redstone")
    .title("Redstone")
    .description("Components which help with redstone engineering")
    .item("minecraft:redstone", true, false)
    .addToIndex()
    .register();

  helper.addToTag("redstone")
    .add("minecraft:redstone_lamp")
    .add("minecraft:repeater");
}
```

### 标签构造器

| 方法 | 说明 |
| --- | --- |
| `title(文字)` | 英文名，翻译键 `<modId>.ponder.tag.<标签>` |
| `description(文字)` | 英文说明，翻译键 `<modId>.ponder.tag.<标签>.description` |
| `item(物品, 用作图标, 用作主物品)` | 用物品当图标。后两个参数省略时都为 `true` |
| `icon(名字)` | 用 `hbui/ponder_addons/<modId>/textures/ponder/tag/<名字>.png` 当图标，64×64 |
| `idAsIcon()` | 同上，图片名取标签名 |
| `addToIndex()` | 在标签索引里列出 |
| `register()` | 完成注册，不调用则不生效 |

主物品是标签界面里点击图标后打开的物品。

### 往标签里加物品

| 写法 | 说明 |
| --- | --- |
| `helper.addToTag(标签, ...).add(物品).add(...)` | 把物品加进一个或多个标签 |
| `helper.addToComponent(物品, ...).add(标签).add(...)` | 反过来写，效果相同 |
| `helper.addTagToComponent(物品, 标签)` | 一次一对 |

标签可以是别的插件的，写完整 id 即可，例如 `helper.addToTag("vanilla:redstone").add("minecraft:tnt")`。

## 共享文本

几个场景都会用到的句子，注册一次：

```js
registerSharedText(helper) {
  helper.registerSharedText("drops", "Once broken, the block drops %1$s");
}
```

场景里用 `.sharedText("drops", 参数)` 引用，也可写 `new P.ResourceLocation("other_mod", "drops")` 跨插件引用。翻译键是 `<modId>.ponder.shared.<key>`。支持索引参数、复用前一参数、字符串、整数、浮点和日期等格式；`%1$s`、`%2$s` 依次替换为参数。参数仍是 JavaScript 值，不具备 Java 的数值类型、任意精度数和全部 Locale 行为，不能视为完整的 `java.util.Formatter`。

Ponder 自带两条：`sneak_and`（“潜行 +”）和 `ctrl_and`（“Ctrl +”），供操作提示的 `whileSneaking`、`whileCTRL` 使用。

## 索引排除

```js
indexExclusions(helper) {
  helper.exclude("minecraft:deepslate_iron_ore");
  helper.exclude(item => item.endsWith("_spawn_egg"));
}
```

被排除的物品不在物品索引里列出，但它的场景照常可以打开。

`P.doScenesExistForId(物品 id)` 查询物品是否注册了场景，不受索引排除影响；`P.indexedItems()` 返回物品索引显示的列表。

注册助手支持数组和 Iterable。`withKeyFunction(fn)` 返回使用自定义取 id 函数的助手，不改变原助手。排除接口还提供 `excludeItemVariants(判断函数, 保留的 id)` 和 `excludeBlockVariants(判断函数, 保留的 id)`。`P.getTags(id)` 返回物品关联的全部标签；`P.tag(id)` 对未注册标签返回屏障标签。

## 翻译键

| 键 | 内容 |
| --- | --- |
| `<modId>.ponder.<场景 id>.header` | 场景标题 |
| `<modId>.ponder.<场景 id>.text_<n>` | 场景里第 n 次调用 `.text()` 的文字 |
| `<modId>.ponder.tag.<标签>` | 标签名 |
| `<modId>.ponder.tag.<标签>.description` | 标签说明 |
| `<modId>.ponder.shared.<key>` | 共享文本 |

翻译放在你自己资源包的 `texts/*.lang` 里，由作者维护，适配器保留文件内容。缺键时按 Java 的玩家界面显示翻译键本身，不回退到脚本里的默认文字。

`/ponder:ponder tags` 打开标签索引，`index` 打开物品索引。给其他玩家打开使用 `/ponder:ponder <物品 id> <玩家>`，需要管理员权限。
