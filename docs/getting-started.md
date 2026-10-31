# 入门教程：做第一个思索包

这篇教程从空目录开始，做一个给红石灯配思索场景的包。做完后，玩家使用红石灯就能看到一段“灯被点亮”的演示。

完成后的样子可以对照 `packs/Vanilla`，它就是按这个思路写的。

## 准备

- Minecraft 基岩版 1.26.51。
- 启用了 Ponder 的行为包和资源包（`src/BP`、`src/RP`）的世界。
- 起一个插件命名空间 `modId`，全小写，只用字母、数字和下划线。本教程用 `my_lamp`。

## 第 1 步：建目录

```
my_lamp/
  BP/
    manifest.json
    scripts/index.js
  RP/
    manifest.json
    content.zipe
    hbui/ponder_addons/my_lamp/plugin.js
    texts/languages.json
    texts/en_US.lang
    texts/zh_CN.lang
```

`content.zipe` 是一个空文件，必须放在资源包根目录。没有它，游戏不会读取资源包 `hbui/` 下的文件。

适配器会为包含 `hbui/` 的资源包补齐缺失的 `content.zipe`，并保留已有文件。原包也应包含这个标记，以便直接安装和检查时同样可用。

## 第 2 步：写 manifest

两个 manifest 互相依赖，但不依赖 Ponder。玩家在世界里另外启用 Ponder 时思索才生效；没启用时，这些文件不起作用，也不会报错。四个 `uuid` 换成你自己生成的。

`BP/manifest.json`：

```json
{
  "format_version": 2,
  "header": {
    "name": "My Lamp Ponder",
    "description": "",
    "min_engine_version": [1, 21, 0],
    "uuid": "<行为包 uuid>",
    "version": [1, 0, 0]
  },
  "modules": [
    { "type": "script", "language": "javascript", "uuid": "<脚本模块 uuid>", "entry": "scripts/index.js", "version": [1, 0, 0] }
  ],
  "dependencies": [
    { "uuid": "<资源包 uuid>", "version": [1, 0, 0] },
    { "module_name": "@minecraft/server", "version": "alpha" }
  ]
}
```

`RP/manifest.json`：

```json
{
  "format_version": 2,
  "header": {
    "name": "My Lamp Ponder",
    "description": "",
    "min_engine_version": [1, 21, 0],
    "uuid": "<资源包 uuid>",
    "version": [1, 0, 0]
  },
  "modules": [
    { "type": "resources", "uuid": "<资源模块 uuid>", "version": [1, 0, 0] }
  ],
  "dependencies": [
    { "uuid": "<行为包 uuid>", "version": [1, 0, 0] }
  ]
}
```

## 第 3 步：报到

`BP/scripts/index.js` 在世界加载后告诉 Ponder 插件脚本的位置，以及哪些物品能打开思索：

```js
import { system, world } from "@minecraft/server";

world.afterEvents.worldLoad.subscribe(() => {
  system.sendScriptEvent("ponder:register", JSON.stringify({
    modId: "my_lamp",
    script: "ponder_addons/my_lamp/plugin.js",   // 资源包 hbui/ 下的路径
    items: ["minecraft:redstone_lamp"],
  }));
});
```

## 第 4 步：写场景

`RP/hbui/ponder_addons/my_lamp/plugin.js`：

```js
(function () {
  const P = window.Ponder;

  // 5×5 的棋盘底板，中间一盏灯，旁边一块红石块
  const schematic = {
    size: { x: 5, y: 2, z: 5 },
    fill(world) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++)
        world.setBlock(x, 0, z, (x + z) % 2 === 0 ? "minecraft:snow" : "minecraft:light_gray_terracotta");
      world.setBlock(2, 1, 2, "minecraft:redstone_lamp");
      world.setBlock(1, 1, 2, "minecraft:redstone_block");
    },
  };

  function lamp(scene, util) {
    scene.title("lamp", "Redstone Lamp");
    scene.configureBasePlate(0, 0, 5);
    scene.showBasePlate();
    scene.idle(10);

    scene.world.showSection(util.select.position(2, 1, 2), "DOWN");
    scene.idle(10);
    scene.overlay.showText(60)
      .text("A Redstone Lamp stays dark on its own")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(70);

    scene.world.showSection(util.select.position(1, 1, 2), "EAST");
    scene.idle(10);
    scene.world.setBlock([2, 1, 2], "minecraft:lit_redstone_lamp");
    scene.overlay.showText(60)
      .text("Any redstone signal next to it lights it up")
      .pointAt(util.vector.centerOf(2, 1, 2))
      .placeNearTarget()
      .attachKeyFrame();
    scene.idle(70);

    scene.markAsFinished();
  }

  P.addPlugin({
    modId: "my_lamp",
    name: "My Lamp",
    registerScenes(helper) {
      helper.addStoryBoard("minecraft:redstone_lamp", schematic, lamp);
    },
  });
})();
```

几点说明：

- 时间单位是 tick，20 tick 为 1 秒。`idle` 之前的指令同时发生，`idle` 让时间往前走。
- `showText(60)` 的文字显示 60 tick。后面 `idle(70)` 比它长一点，让文字消失后再进入下一步。
- `title` 的第一个参数是场景 id，翻译键用它拼出来。

## 第 5 步：翻译

`.text()` 和 `title()` 里写的是英文默认，Ponder 先按翻译键查找，找不到才用它。键按 `.text()` 的调用顺序编号：

`RP/texts/zh_CN.lang`：

```
my_lamp.ponder.lamp.header=红石灯
my_lamp.ponder.lamp.text_1=红石灯自己不会发光
my_lamp.ponder.lamp.text_2=旁边有任何红石信号都会把它点亮
```

`en_US.lang` 照同样的键写英文。`languages.json` 写 `["en_US", "zh_CN"]`。

## 第 6 步：试一下

1. 把 `BP` 和 `RP` 分别放进 `development_behavior_packs` 和 `development_resource_packs`。
2. 在已启用 Ponder 的世界里同时启用这两个包。
3. 进入世界，拿着红石灯使用，或者输入 `/ponder:ponder minecraft:redstone_lamp`。

如果界面里没有你的场景，先检查：

- 报到的 `modId` 和 `P.addPlugin` 的 `modId` 是否一致。
- `script` 路径是否从 `hbui/` 之后写起。
- 资源包根目录有没有 `content.zipe`。

## 接下来

- 给物品分类：[注册标签](reference/registration.md)
- 更多场景指令：[场景指令](reference/scene.md)
- 自己的方块和特效：[自定义方块、粒子与实体](reference/custom-content.md)
