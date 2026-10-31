# 接口参考：场景指令

场景函数接收 `scene` 和 `util`。指令按书写顺序执行，时间单位是 tick，20 tick 为 1 秒。`idle` 之前连续写出的指令在同一时刻发生。指令分组通过 `scene.world()`、`overlay()`、`effects()`、`special()`、`debug()` 取得；工具通过 `util.select()`、`vector()`、`grid()` 取得，每个场景拥有自己的工具实例。

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
| `getScene()` | 取得运行中的场景对象，可以调用 `getWorld()`、`getSceneBuildingUtil()`、`resolveOptional(link)`、`runWith(link, 回调)` 等方法 |
| `debug()` | 提供播放场景所需的 `addInstructionInstance(指令)` 和 `enqueueCallback(回调)` |

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

选区的 `add(另一个)` 和 `substract(另一个)` 原地修改并返回自己。`getCenter()` 返回中心，`makeOutline()` 创建描边，`test(BlockPos)` 判断包含关系，`forEach(回调)` 和迭代器遍历位置。`column` 从 y=1 开始，不含底板；`layers` 会限制高度。

### util.vector

| 方法 | 说明 |
| --- | --- |
| `of(x, y, z)` | 任意点 |
| `centerOf(x, y, z)` | 方块中心 |
| `topOf(x, y, z)` | 方块顶面中心 |
| `blockSurface([x, y, z], 朝向, 外偏)` | 方块某个面往外一点，外偏默认 0 |

`util.grid().at(x, y, z)` 返回 `P.BlockPos`，可链式调用 `above()`、`east()`、`offset()`、`relative()`。`vector` 方法返回 `P.Vec3`，支持 `add()`、`subtract()`、`scale()`；两者也可按数组索引读取。`position`、`fromTo`、`centerOf`、`topOf` 同时接收位置对象和分开的坐标。`new P.AABB(小角, 大角)` 会整理两角大小，提供 `inflate()`、`move()`、`expandTowards()`、`contract()`。

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
const head = scene.world().showIndependentSection(util.select().position(2, 1, 2), "WEST");
scene.world().moveSection(head, [1, 0, 0], 10);
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
| `cycleBlockProperty([x, y, z], 状态名, 取值列表)` | 取值列表可省略，使用适配器提取的原版或附属包状态域；未知状态报错 |
| `toggleRedstonePower(选区)` | 按状态域切换功率、通电或点亮状态，包括附属包声明的状态 |
| `modifyBlockEntity(位置, 类型, 函数)` | 函数接收对应类型的实时方块实体对象 |
| `modifyBlockEntityNBT(选区, 类型, 函数[, 重绘方块])` | 类型为 `P.BannerBlockEntity` 等类，函数接收 Java 形式的 `P.CompoundTag`；第四参数省略时不重建静态模型 |
| `restoreBlocks(选区)` | 恢复成结构里的初始方块 |
| `destroyBlock([x, y, z])` | 破坏并播粒子 |
| `incrementBlockBreakingProgress([x, y, z])` | 破坏进度加一档，第十档时破坏 |

`播粒子` 省略时不播。方块参数传 `null` 表示空气。

### 方块与状态

方块用基岩版 id。带状态时用 `P.block`：

```js
P.block("minecraft:unpowered_repeater", { "minecraft:cardinal_direction": "west", repeater_delay: 0 })
```

状态名和取值用当前基岩版的（bedrock-samples 的 `metadata/vanilladata_modules/mojang-blocks.json` 里有全部）。原版方块按游戏里的外形画，外形随状态变：中继器、比较器的 `minecraft:cardinal_direction` 是输入那一侧；活塞的 `facing_direction` 是活塞头朝向，2 南、3 北、4 东、5 西。

栅栏、玻璃板、铁栏杆怎么连，楼梯怎么拐角，也是状态（`minecraft:connection_north` 等、`minecraft:corner`），要连就写上；墙用 `wall_connection_type_*` 和 `wall_post_bit`。红石粉不用写，按周围的方块自动连。

水和岩浆的液位是 `liquid_depth`：0 是源头，1 到 7 是流动的（越大越浅），8 及以上是往下落的。水面高度和流向按周围的方块算，不用另写。

`P.block` 的第三个参数写状态以外的东西：`liquid` 是含水方块里的水，`nbt` 是方块实体数据。结构文件里的含水方块和方块实体会自动读进来，不用另写。

```js
P.block("minecraft:smooth_stone_slab", { "minecraft:vertical_half": "bottom" }, { liquid: P.block("minecraft:water", { liquid_depth: 0 }) })
P.block("minecraft:bed", { direction: 2, head_piece_bit: true }, { nbt: { id: "Bed", color: 11 } })
```

床和旗帜的数据按基岩版存档的写法：

- 床：`{ id: "Bed", color }`，`color` 从 0 白到 15 黑（白、橙、品红、淡蓝、黄、黄绿、粉红、灰、淡灰、青、紫、蓝、棕、绿、红、黑）。
- 旗帜：`{ id: "Banner", Base, Patterns: [{ Color, Pattern }], Type }`。`Base` 和 `Color` 的颜色顺序反过来，0 黑到 15 白；`Pattern` 是图案代号（`cre` 苦力怕、`bo` 边框、`ss` 竖条纹等）；`Type` 为 1 是不祥旗帜。

没写数据的床是红色的，旗帜是白色的。床的状态是 `direction`（床头朝向，0 南、1 西、2 北、3 东）和 `head_piece_bit`；立着的旗帜是 `ground_sign_direction`（0 到 15，0 朝南），挂墙的是 `facing_direction`（2 北、3 南、4 西、5 东）。

```js
scene.world().modifyBlockEntityNBT(util.select().position(2, 1, 2), P.BannerBlockEntity, nbt => {
  nbt.getList("patterns").push({ color: "orange", pattern: "minecraft:creeper" });
});
```

结构和 `P.block(..., { nbt })` 存储基岩数据，指令中的 `CompoundTag` 使用对应方块实体的 Java 字段。它提供 `getInt`、`putInt`、`getString`、`putString`、`getBoolean`、`getCompound`、`getList`、`copy` 等方法。可见区段每个世界 tick 推进方块实体一次，重播恢复结构初态。移动活塞在脚本里设置的 `blockState` 使用 `{ id, states }`；Java 结构中的 `{ Name, Properties }` 由适配器离线转换，运行时不再转换。

```js
scene.world().modifyBlockEntity(util.grid().at(2, 1, 2), P.ChestBlockEntity, chest => chest.startOpen());
scene.idle(20);
scene.world().modifyBlockEntity(util.grid().at(2, 1, 2), P.ChestBlockEntity, chest => chest.stopOpen());
```

自定义方块实体继承 `P.BlockEntity`，实现 `tick()`、`fromBedrock(tag)`、`bedrockData()` 等需要的方法，用 `P.registerBlockEntity(ids, Type, renderer)` 注册。绘制函数接收 `(d, entity, matrix, partialTick, light, size, ticks, model, visibleQuads)`，负责画完该方块，包括需要保留的静态部分；沿用现有 `P.drawModelQuads` 和 `P.drawBlockCube`。

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
| `text(文字, ...参数)` | 内容和格式参数。翻译键按调用顺序编号，见[插件注册](registration.md)的“翻译键”一节 |
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
scene.overlay().showOutline(P.Palette.GREEN, "lamp", util.select().position(2, 1, 2), 40);
scene.overlay().showLine(P.Palette.RED, util.vector().centerOf(1, 1, 2), util.vector().centerOf(3, 1, 2), 40);
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
scene.overlay().showControls(util.vector().topOf(2, 1, 2), "DOWN", 40)
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
| `showing(图标)` | 用 `P.Icons` 的图标，或提供带 `render(d, x, y, alpha)` 的 ScreenElement 对象 |
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
scene.effects().indicateRedstone([2, 1, 2]);
scene.effects().indicateSuccess([2, 1, 2]);

scene.effects().emitParticles(
  util.vector().centerOf(2, 1, 2),
  scene.effects().simpleParticleEmitter(P.dust(0xff0000, 1), [0, 0.2, 0]),
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

粒子可用 `P.dust(颜色, 大小)`、`P.dustTransition(起始颜色, 结束颜色, 大小)`、`P.entityEffect(颜色, 透明度)`、`P.blockParticle(方块)`、`P.itemParticle(物品)`，颜色是 `0xRRGGBB`，透明度为 0 到 1。

`P.ParticleTypes` 提供以下类型：

| 类别 | 名称 |
| --- | --- |
| 烟与火焰 | `SMOKE`、`LARGE_SMOKE`、`WHITE_SMOKE`、`SPIT`、`POOF`、`FLAME`、`SMALL_FLAME`、`SOUL_FIRE_FLAME`、`CAMPFIRE_COSY_SMOKE`、`CAMPFIRE_SIGNAL_SMOKE`、`LAVA` |
| 提示与命中 | `HEART`、`ANGRY_VILLAGER`、`NOTE`、`CRIT`、`ENCHANTED_HIT`、`DAMAGE_INDICATOR`、`HAPPY_VILLAGER`、`COMPOSTER`、`EGG_CRACK` |
| 魔法与轨迹 | `PORTAL`、`REVERSE_PORTAL`、`ENCHANT`、`NAUTILUS`、`VAULT_CONNECTION`、`EFFECT`、`INSTANT_EFFECT`、`ENTITY_EFFECT`、`WITCH`、`END_ROD`、`TOTEM_OF_UNDYING` |
| 水与环境 | `BUBBLE`、`BUBBLE_COLUMN_UP`、`BUBBLE_POP`、`RAIN`、`SPLASH`、`FISHING`、`MYCELIUM`、`DOLPHIN` |

运动向量按对应粒子的语义使用，例如 `NOTE` 的第一个分量决定颜色，`ENCHANT` 的向量决定飞向发射点前的初始偏移。其他粒子通过 `{ make(world, x, y, z, mx, my, mz) }` 提供实例，尚未内置全部原版粒子类型。自定义粒子见[自定义方块、粒子与实体](custom-content.md)。

## scene.world 的掉落物与实体

```js
const item = scene.world().createItemEntity(util.vector().centerOf(2, 2, 2), [0, 0.2, 0], "minecraft:redstone");
scene.idle(20);
scene.world().modifyEntity(item, entity => entity.discard());
```

| 方法 | 说明 |
| --- | --- |
| `createItemEntity(位置, 初速度, 物品)` | 生成掉落物，物品是 id 或 `{ id, count }`，返回 link |
| `createClientEntity(实体 id, 位置, 朝向, 设置函数)` | 生成一个原版或附属包的实体（`P.ClientEntity`），返回 link。朝向是度数，0 朝南、90 朝西；设置函数可省略，收到实体后可以改它 |
| `createEntity(工厂)` | 生成自定义实体，工厂接收世界，返回实体 |
| `modifyEntity(link, 回调)` | 修改一个实体 |
| `modifyEntities(类型, 回调)` | 修改该类型的所有实体 |
| `modifyEntitiesInside(类型, 选区, 回调)` | 只修改选区内的 |

掉落物的类型是 `P.ItemEntity`。掉落物有重力和碰撞，存在超过 6000 tick 会自行消失。物品对象可带 `components`；掉落方块还可带 `states` 和 `nbt`。`minecraft:dyed_color`、`potion_contents`、`enchantments`、`enchantment_glint_override` 等组件同时影响已支持的模型、染色、光效和提示行；这并不覆盖全部原版物品的特殊模型和提示语义。

```js
const sheep = scene.world().createClientEntity("minecraft:sheep", [2.5, 1, 2.5], 0);
scene.idle(20);
scene.world().modifyEntity(sheep, e => { e.yRot = 90; });   // 转身朝西
```

实体按游戏里的模型、动画和渲染控制器画，自己不会动（没有 AI）。怎么让它走、转头、坐下，见[自定义方块、粒子与实体](custom-content.md)的“原版和附属包的实体”一节。

## scene.special

| 方法 | 说明 |
| --- | --- |
| `movePointOfInterest(位置)` | `BlockPos` 取方块中心，`Vec3` 或数组取精确位置 |
| `hideElement(link, 方向)` | 让一个元素滑出 |
| `createBirb(位置, 姿态)` | 从上方淡入一只鹦鹉，返回 link。颜色在红蓝、绿、黄蓝、灰里随机 |
| `changeBirbPose(link, 姿态)` | 换鹦鹉的姿态 |
| `moveParrot(link, 偏移, tick)` | 在这些 tick 里把鹦鹉移动偏移量 |
| `rotateParrot(link, x, y, z, tick)` | 在这些 tick 里转动鹦鹉（x 是头的俯仰，y 是身体朝向） |
| `createCart(位置, 角度, 工厂)` | 工厂接收 `(world, x, y, z)` 并返回矿车，可以设置 `displayBlock` 和 `displayOffset`；从上方淡入并返回 link |
| `rotateCart(link, 角度, tick)` | 在这些 tick 里转动矿车 |
| `moveCart(link, 偏移, tick)` | 在这些 tick 里移动矿车 |

鹦鹉的姿态（`P.ParrotPose.xxx`，直接写类名）：

| 姿态 | 说明 |
| --- | --- |
| `FacePointOfInterestPose` | 头和身体转向镜头的注视点 |
| `FaceCursorPose` | 转向鼠标 |
| `DancePose` | 跳舞，原地慢慢转圈 |
| `FlappyPose` | 移动时扇翅膀 |

```js
const birb = scene.special().createBirb(util.vector().topOf(2, 1, 2), P.ParrotPose.FacePointOfInterestPose);
scene.idle(20);
scene.special().changeBirbPose(birb, P.ParrotPose.FlappyPose);
scene.special().moveParrot(birb, [0, 1, 0], 20);
```
