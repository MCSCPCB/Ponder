# 接口参考：场景指令

场景函数接收 `scene` 和 `util`。指令按书写顺序执行，时间单位是 tick，20 tick 为 1 秒。`idle` 之前连续写出的指令在同一时刻发生。

```js
function scene(scene, util) {
  scene.title("intro", "Introduction");
  scene.configureBasePlate(0, 0, 5);
  scene.showBasePlate();
  scene.idle(10);
  scene.markAsFinished();
}
```

## scene

| 方法 | 说明 |
| --- | --- |
| `title(场景 id, 英文标题)` | 场景 id 用于翻译键和场景排序 |
| `configureBasePlate(x, z, 边长)` | 底板的左上角和边长 |
| `showBasePlate()` | 显示底板范围内 y=0 的方块，并加上平台阴影 |
| `scaleSceneView(倍率)` | 缩放整个场景 |
| `setSceneOffsetY(偏移)` | 场景上下移动 |
| `removeShadow()` | 不画平台阴影 |
| `idle(tick)` | 等待 |
| `idleSeconds(秒)` | 等待，参数是秒 |
| `rotateCameraY(角度)` | 水平旋转镜头 |
| `addKeyframe()` | 在进度条上打一个关键帧 |
| `addLazyKeyframe()` | 同上，但关键帧推后 6 tick，文字的 `attachKeyFrame` 用的就是它 |
| `markAsFinished()` | 到这里即视为看完，进度条可以跳到下一个场景 |
| `setNextUpEnabled(开关)` | 暂时禁止或恢复跳到下一个场景 |

## util

### util.select

| 方法 | 范围 |
| --- | --- |
| `position(x, y, z)` | 一个方块 |
| `fromTo(x1, y1, z1, x2, y2, z2)` | 方块区间，两个角点顺序任意 |
| `cuboid(起点, [dx, dy, dz])` | 从起点出发的区间 |
| `layer(y)` | 整层 |
| `layers(y, 层数)` | 从 y 起连续几层 |
| `layersFrom(y)` | 从 y 到结构顶部 |
| `column(x, z)` | 整列 |
| `everywhere()` | 整个结构 |

选区可以 `add(另一个)` 合并、`substract(另一个)` 相减。`center()` 返回选区中心。

### util.vector

| 方法 | 说明 |
| --- | --- |
| `of(x, y, z)` | 任意点 |
| `centerOf(x, y, z)` | 方块中心 |
| `topOf(x, y, z)` | 方块顶面中心 |
| `blockSurface([x, y, z], 朝向, 外偏)` | 方块某个面往外一点，外偏默认 0 |

`util.grid.at(x, y, z)` 给出方块坐标，用在需要方块位置的参数上。

朝向是 `"UP"`、`"DOWN"`、`"NORTH"`、`"SOUTH"`、`"WEST"`、`"EAST"`。

## scene.world

### 显示与隐藏

| 方法 | 说明 |
| --- | --- |
| `showSection(选区, 方向)` | 方块从该方向滑入，并入场景主体 |
| `showSectionAndMerge(选区, 方向, link)` | 滑入并并入已有的独立段 |
| `glueBlockOnto([x, y, z], 方向, link)` | 把一个方块并入独立段 |
| `showIndependentSection(选区, 方向)` | 滑入为独立的一段，返回 link |
| `showIndependentSectionImmediately(选区)` | 立刻显示为独立的一段，返回 link |
| `makeSectionIndependent(选区)` | 把已显示的方块拆成独立的一段，返回 link |
| `hideSection(选区, 方向)` | 滑出 |
| `hideIndependentSection(link, 方向)` | 让独立的一段滑出 |

并入场景主体的方块不能单独移动。要移动或旋转的方块用独立段，并保存返回的 link：

```js
const head = scene.world.showIndependentSection(util.select.position(2, 1, 2), "WEST");
scene.world.moveSection(head, [1, 0, 0], 10);
```

| 方法 | 说明 |
| --- | --- |
| `moveSection(link, [dx, dy, dz], tick)` | 平移 |
| `rotateSection(link, x 角度, y 角度, z 角度, tick)` | 旋转 |
| `configureCenterOfRotation(link, 锚点)` | 旋转中心 |
| `configureStabilization(link, 锚点)` | 旋转时保持朝向的参考点 |

### 修改方块

| 方法 | 说明 |
| --- | --- |
| `setBlock([x, y, z], 方块, 播粒子)` | 替换一个方块 |
| `setBlocks(选区, 方块, 播粒子)` | 替换选区，空气位置也放 |
| `replaceBlocks(选区, 方块, 播粒子)` | 只替换已有方块的位置 |
| `modifyBlock([x, y, z], 函数, 播粒子)` | 函数接收旧方块、返回新方块 |
| `modifyBlocks(选区, 函数, 播粒子)` | 对整个选区 |
| `cycleBlockProperty([x, y, z], 状态名, 取值列表)` | 状态按列表循环。布尔和 0/1 状态可以不给列表 |
| `toggleRedstonePower(选区)` | 翻转红石功率：信号 0 与 15 对调，点亮状态取反 |
| `restoreBlocks(选区)` | 恢复成结构里的初始方块 |
| `destroyBlock([x, y, z])` | 破坏并播粒子 |
| `incrementBlockBreakingProgress([x, y, z])` | 破坏进度加一档，第十档时破坏 |

`播粒子` 省略时不播。方块参数传 `null` 表示空气。

### 方块与状态

方块用基岩版 id。带状态时用 `P.block`：

```js
P.block("minecraft:unpowered_repeater", { direction: 1, repeater_delay: 0 })
```

`modifyBlock` 的函数里：

| 函数 | 说明 |
| --- | --- |
| `P.blockId(方块)` | 方块 id |
| `P.blockStates(方块)` | 状态对象 |
| `P.withStates(方块, { 状态名: 新值 })` | 改状态后的方块 |
| `P.toggleRedstonePower(方块)` | 翻转一个方块的红石状态 |

## scene.overlay

### 文字

`showText(tick)` 返回文字构造器：

| 方法 | 说明 |
| --- | --- |
| `text(文字)` | 内容。翻译键按调用顺序编号，见[插件注册](registration.md)的“翻译键”一节 |
| `sharedText(key, ...参数)` | 用本插件的共享文本 |
| `pointAt(位置)` | 指示线指向的场景坐标 |
| `placeNearTarget()` | 文字贴近指示点，否则放在屏幕左侧 |
| `independent(y)` | 固定在屏幕高度 y |
| `colored(颜色)` | 文字颜色，用 `P.Palette` |
| `attachKeyFrame()` | 在进度条上打一个关键帧 |

`showOutlineWithText(选区, tick)` 是带方块描边的文字，用法相同，并且自带指向选区中心。

颜色（`P.Palette`）：`WHITE`、`BLACK`、`RED`、`GREEN`、`BLUE`、`SLOW`（绿）、`MEDIUM`（蓝）、`FAST`（品红）、`INPUT`（青）、`OUTPUT`（黄）。

### 描边与线条

```js
scene.overlay.showOutline(P.Palette.GREEN, "lamp", util.select.position(2, 1, 2), 40);
scene.overlay.showLine(P.Palette.RED, util.vector.centerOf(1, 1, 2), util.vector.centerOf(3, 1, 2), 40);
```

| 方法 | 说明 |
| --- | --- |
| `showOutline(颜色, 槽位, 选区, tick)` | 描选区的边 |
| `chaseBoundingBoxOutline(颜色, 槽位, 盒子, tick)` | 描任意盒子，盒子是 `[[x1, y1, z1], [x2, y2, z2]]` |
| `showLine(颜色, 起点, 终点, tick)` | 线段 |
| `showBigLine(颜色, 起点, 终点, tick)` | 更粗的线段 |

槽位是任意字符串。同名的新描边会顶掉旧的，所以用固定槽位可以让描边移动到新位置。

### 操作提示

```js
scene.overlay.showControls(util.vector.topOf(2, 1, 2), "DOWN", 40)
  .rightClick()
  .withItem("minecraft:redstone")
  .whileSneaking();
```

第二个参数是提示框相对指向点的方位：`"UP"`、`"DOWN"`、`"LEFT"`、`"RIGHT"`。

| 方法 | 说明 |
| --- | --- |
| `leftClick()` | 左键图标 |
| `rightClick()` | 右键图标 |
| `scroll()` | 滚轮图标 |
| `showing(图标)` | 用 `P.Icons` 里的图标 |
| `withItem(物品 id)` | 附带物品 |
| `whileSneaking()` | 加上“潜行 +”前缀 |
| `whileCTRL()` | 加上“Ctrl +”前缀 |

`P.Icons`：`LEFT`、`RIGHT`、`CLOSE`、`IDENTIFY`、`REPLAY`、`USER_MODE`、`SLOW_MODE`、`DISABLE`、`LMB`、`SCROLL`、`RMB`。

### 数值框高亮

在方块表面标出一块亮区，提示“滚轮调节这里”：

| 方法 | 说明 |
| --- | --- |
| `showScrollInput(位置, 朝向, tick)` | 在该位置标一个贴着该面的亮区 |
| `showCenteredScrollInput([x, y, z], 朝向, tick)` | 自动取方块该面的中心 |
| `showFilterSlotInput(位置, 朝向, tick)` | 更小的一块 |
| `showFilterSlotInput(位置, tick)` | 不贴面，直接给大小 |
| `showRepeaterScrollInput([x, y, z], tick)` | 中继器底座的位置 |

## scene.effects

### 粒子

```js
scene.effects.indicateRedstone([2, 1, 2]);
scene.effects.indicateSuccess([2, 1, 2]);

scene.effects.emitParticles(
  util.vector.centerOf(2, 1, 2),
  scene.effects.simpleParticleEmitter(P.dust(0xff0000, 1), [0, 0.2, 0]),
  8,   // 每个周期的数量
  4,   // 周期数
);
```

| 方法 | 说明 |
| --- | --- |
| `indicateRedstone([x, y, z])` | 红色粉尘 |
| `indicateSuccess([x, y, z])` | 绿色粉尘 |
| `emitParticles(位置, 发射器, 每周期数量, 周期数)` | 持续发射 |
| `simpleParticleEmitter(粒子, 运动向量)` | 在位置上发射 |
| `particleEmitterWithinBlockSpace(粒子, 运动向量)` | 散布到所在方块内 |

粒子用 `P.dust(颜色, 大小)` 或 `P.blockParticle(方块)`。颜色是 `0xRRGGBB`。自定义粒子见[自定义方块、粒子与实体](custom-content.md)。

### 掉落物与实体

```js
const item = scene.effects.createItemEntity(util.vector.centerOf(2, 2, 2), [0, 0.2, 0], "minecraft:redstone");
scene.idle(20);
scene.effects.modifyEntity(item, entity => entity.discard());
```

| 方法 | 说明 |
| --- | --- |
| `createItemEntity(位置, 初速度, 物品)` | 生成掉落物，物品是 id 或 `{ id, count }`，返回 link |
| `createEntity(工厂)` | 生成自定义实体，工厂接收世界，返回实体 |
| `modifyEntity(link, 回调)` | 修改一个实体 |
| `modifyEntities(类型, 回调)` | 修改该类型的所有实体 |
| `modifyEntitiesInside(类型, 选区, 回调)` | 只修改选区内的 |

掉落物的类型是 `P.ItemEntity`。掉落物有重力和碰撞，落到世界底部（y ≤ -0.5）或存在超过 6000 tick 会自行消失。

## scene.special

| 方法 | 说明 |
| --- | --- |
| `movePointOfInterest(位置)` | 把镜头的注视点移到该位置 |
| `movePointOfInterestTo([x, y, z])` | 同上，参数是方块坐标 |
| `hideElement(link, 方向)` | 让一个元素滑出 |
