# TODO：完全复刻 Java Ponder 还差的部分

对照的是 Java Ponder（mc1.21.1-dev，本地在 `_sample/Ponder-mc1.21.1-dev`，不进仓库）。Java 的位置写类名和行号，我们的位置写路径和行号，`R/` 是 `src/RP/hbui/ponder/`。行号是 2026-10-30 的，代码改动后会偏。

最后一节是平台做不到或已经决定不做的，不算待办，列出来备查。

交付范围按功能用途判断：玩家观看和使用思索的功能、场景运行所需接口保留；辅助编写和调试场景的工具不做。物品信息以基岩版 1.26.51 的规则为准；场景中的操作提示保持原文；缺译时按 Java 显示翻译键。

## 待实机确认

- [ ] 实体渲染整体：离线 131 个原版实体的推进和绘制计算没有报错，但部分默认状态没有绘制面，整体显示仍待游戏内确认。Vanilla 包用拴绳打开的场景里有鹦鹉、运输矿车、羊、猫、走路的牛。
- [ ] 猫、豹猫、北极熊的身体可能是竖着的。1.21.0 版模型里它们的 body 骨骼没有 90° 的静止旋转，可坐下、站起的动画要身体本来就转了 90° 才和 Java 的角度对得上，游戏从哪里拿到这 90° 没查到。
- [x] `.tga` 贴图在 Ore UI 里能不能显示。旗帜图案全是 `.tga`。
- [x] 床、旗帜、含水方块、水贴着玻璃和树叶的那一面（同一个测试场景里有）。

## 实体

### 数据

- [x] 适配器从 `tools/version/common/` 的共享 APK 读取原版资源与行为层，按目标版本筛选并按标识符合并实体、模型、动画和控制器；各版本目录只保留自己的 `gui/` 和 `scaffold/`。
- [x] 碰撞箱对所有实体都是 0.6 × 1.8（`R/entities/entity_models.js` 的 ClientEntity 构造函数）。Java 用各实体类型自己的尺寸。适配器可以从行为包的 `minecraft:collision_box` 读（sample 行为包里有 168 处）。
- [x] 史莱姆、岩浆怪默认 `variant` 是 0，画不出来，现在要场景自己设大小。
- [x] 唤魔者尖牙要设 `life_span` 才出现。

### 画法

- [ ] 船、运输船：游戏用代码画，没有模型文件。要像床、旗帜那样照 Java 的 BoatModel 自己写模型。
- [ ] 盔甲和手持物品（attachables）不画。
- [ ] 附魔光效（glint）没做。
- [ ] 自发光（emissive）材质按普通材质画。
- [ ] 叠加混合（additive）按普通半透明画。
- [ ] `uv_anim` 贴图滚动的回绕是近似的。
- [ ] 靠贴图 alpha 做染色遮罩的部位（羊毛等）颜色可能略偏：`coh-color-matrix` 滤镜处理的是预乘过的 alpha。
- [x] `is_in_water`、`is_in_lava` 按碰撞箱碰到的格子算，不看水面高度。`time_stamp` 用实体自己的 tick 数，不是世界时间。

## 方块与世界渲染

光照和 Java 一致：Java 的思索世界全亮，淡入淡出时光照从 5 到 15（PonderLevel.java:144-145、WorldSectionElementImpl.java:318-322），我们也是这样。

- [ ] 方块实体渲染器：Java 每个方块实体都用它的 BlockEntityRenderer 画（WorldSectionElementImpl.java:413-440）。我们只有床和旗帜有实体模型（`R/blocks/block_entity_models.js:11`），其他的（箱子、告示牌、头颅、钟、讲台、附魔台、潮涌核心、营火、信标、刷怪笼、末地传送门等）按 Scaffold 的静态外形画。渲染器画的那部分我们没有，比如告示牌上的字、信标光柱、刷怪笼里转的生物、营火上的食物。
- [x] 箱子的外形比格子偏 1 像素，是 Scaffold 数据本身的问题。
- [ ] 环境光遮蔽：开了平滑光照（默认开）时，Java 方块的角落会变暗（原版 ModelBlockRenderer，经 WorldSectionElementImpl.buildStructureBuffer 调用）。我们没有。我们每个面是一张平铺的图，做不出逐顶点的渐变，要另想办法，比如叠一层渐变。
- [x] 随机偏移：花、草、竹子这类方块在 Java 里按位置随机偏一点（原版 `BlockState.getOffset`），我们放在格子正中。
- [ ] 前后遮挡：Java 用深度缓冲。我们按方块中心的深度、模型按每个面的深度从远到近画（`R/render/world_render.js:93、104、142-145`），互相穿插的面、很长的面可能前后画反。这是逐面画图这种做法本身的限制。
- [x] 识别模式选中方块的白框：Java 按方块形状的包围盒画 1/64 宽的框（WorldSectionElementImpl.java:386-410），我们总是画整格（`world_render.js:215-222`）。
- [x] 破坏方块的粒子：Java 按方块的形状撒（PonderLevel.java:276-279），我们按整格撒（`R/level/ponder_level.js:72-79`）。
- [ ] 掉落物：Java 画物品自己的模型，楼梯、栅栏保持形状，普通物品有 1 像素厚。我们方块类的画成整个方块，其他画成平面图标（`world_render.js:154-211`）。
- [x] 附属包方块：不支持 box UV 和 `tint_method` 染色（见 `docs/reference/custom-content.md`）。
- [ ] 含水方块里的水不会被方块自己挡住（Java 的 `isFaceOccludedBySelf`），比如台阶里的水会画到台阶内部。
- 方块实体不 tick：见“场景指令 / 世界”。

## 场景指令

括号里的次数是 Create 自己的场景里调用了多少次，用来估计搬 Create 的场景时多常碰到。

### 写法和参数

- [x] `scene.world()`、`overlay()`、`effects()`、`special()` 和 `util.select()`、`vector()`、`grid()` 在 Java 是方法，我们是属性（`R/foundation/registration.js:250-282`）。搬 Java 代码要去掉括号。
- [x] 位置对象：Java 的 `grid().at()` 返回 BlockPos，带 `above`、`east`、`offset`、`relative` 等方法，Vec3、AABB 也是对象（PositionUtil.java:6）。我们都是数组（`registration.js:256`）。Create 的场景里到处是这种链式写法。
- [x] 收方块位置的重载没有，我们只收 `(x, y, z)`（`registration.js:252-260`）：`select().position(BlockPos)`（SelectionUtil.java:11，200 次）、`fromTo(BlockPos, BlockPos)`（:15，8 次）、`vector().centerOf(BlockPos)`（VectorUtil.java:10，69 次）、`topOf(BlockPos)`（:14，128 次）。传数组进去，选区是空的、向量是乱的，也不报错。
- [x] `movePointOfInterest(BlockPos)`（SpecialInstructions.java:21，32 次里 30 次传方块位置）：我们收方块位置的那个叫 `movePointOfInterestTo`（`registration.js:464`）。方块位置传给 `movePointOfInterest` 会被当成 Vec3，点落在方块的角上，每个轴偏半格。
- [x] 实体指令放错了地方：`createEntity`、`createItemEntity`、`modifyEntity`、`modifyEntities`、`modifyEntitiesInside` 在 Java 属于 `world()`（WorldInstructions.java:71-80；`modifyEntit*` 62 次，`createItemEntity` 63 次），我们放在 `scene.effects`（`registration.js:418-446`）。
- [x] `getScene()`（SceneBuilder.java:36）没有，只有 `scene` 字段。

### 世界

- [x] `cycleBlockProperty`（WorldInstructions.java:65，140 次）：Java 按属性自己的取值表轮换。我们是 `(位置, 状态名, 取值表)`，不给取值表时数字算 `1 - v`、其他取反（`registration.js:376-384`），`redstone_signal` 5 会变成 -4，方向会变成 `false`。基岩运行时拿不到取值表，可以考虑离线从 bedrock-samples 的 `mojang-blocks.json` 生成。
- [x] `toggleRedstonePower`（241 次）：Java 切换任何方块的 POWER、POWERED、LIT 属性（PonderSceneBuilder.java:567-577）。我们只认一张原版状态和 id 的对照表（`R/blocks/blocks.js:160-178`），附属包方块自己的通电、点亮状态不会变。
- [x] `modifyBlockEntity(位置, 类, 函数)`（WorldInstructions.java:85，157 次）没有，我们也没有方块实体对象可以交出去。
- [x] `modifyBlockEntityNBT`（76 次）：Java 不重绘，按 Java 类匹配，给的是 Java 的 NBT；带 `reDrawBlocks` 的 4 参数版本另算（WorldInstructions.java:82、88）。我们总是重绘，按基岩方块实体 id 匹配 `nbt.id`，给的是基岩格式的数据，也不分 3 参数和 4 参数（`registration.js:391-402`）。
- [x] 方块实体不 tick：Java 的 `WorldSectionElementImpl.tick()` 会跑区块里方块实体的 ticker（:266-279），我们只推进上一帧的偏移和旋转（`R/foundation/element/elements.js:32`）。原版方块少见，Create 的动力方块全靠它。
- [x] `modifyEntity`、`modifyEntities` 碰到已经移除的实体：Java 照样调用回调（TrackedElementBase.java:21-26、PonderScene.java:396-402），我们跳过（`R/level/ponder_entity.js:89`、`registration.js:440`）。

### 描边

- [x] `chaseBoundingBoxOutline`（212 次）：Java 传 AABB，构造时会把两角排好大小，还有 `inflate`、`move`、`expandTowards`、`contract` 用来拼框（OverlayInstructions.java:19）。我们收 `[[小角], [大角]]`，不排序，也没有这些工具（`registration.js:504`）。
- [x] 描边的 slot 按值比较：Java 的 Outliner 用 `equals()`（Outliner.java:35），`showLine`、`showBigLine` 拿起点当 slot（LineInstruction.java:26），`HighlightValueBox` 拿位置当 slot。我们的 Map 按引用比较（`R/foundation/outliner.js:71-78、179、191`）。分别创建、起点相同的两条线，Java 是一条，我们是两条；BlockPos、Vec3 当 slot 都一样。
- [x] 单个盒子的 `showOutline`：Java 画成 ChasingAABBOutline（SelectionImpl.java:119-121、Outliner.java:68-80），之后同一个 slot 的 `chaseBoundingBoxOutline` 会从这个盒子滑过去。我们总是画成方块簇（`outliner.js:149`），之后的追随框直接出现在目标处（`outliner.js:63-65`）。

### 粒子、鹦鹉、矿车

- [ ] `simpleParticleEmitter`、`particleEmitterWithinBlockSpace` 在 Java 收任何 ParticleOptions（EffectInstructions.java:11、13，约 9 次）。我们只有 `P.dust`、`P.blockParticle` 和插件自己写的粒子（`R/foundation/ponder_world_particles.js:117-118`），SPIT、LARGE_SMOKE、ITEM 这些原版粒子没有。
- [x] `createCart` 的第三个参数在 Java 是构造函数，可以顺带设置矿车（SpecialInstructions.java:28，8 次）。我们收实体 id，装着东西的只画箱子、漏斗、TNT、命令方块四种（`R/entities/entity_elements.js:129-132`）。

### 文字和输入窗口

- [x] `text(默认文字, 参数...)` 的参数被忽略（TextElementBuilder.java:21；`registration.js:537`）。
- [x] `sharedText(ResourceLocation[, 参数])` 只收字符串、只查场景自己的命名空间（`registration.js:539`），也见“注册接口”。
- [x] `InputElementBuilder.showing(ScreenElement)` 收任何图标（InputElementBuilder.java:16，18 次）。我们只能画 Ponder 自带 widgets 图里的格子（`R/foundation/element/elements.js:98、117`），Create 的 AllIcons 画不出。

### 选区

- [x] `select().column(x, z)`：Java 的 y 从 1 到 ySpan+1，不含底板（PonderSceneBuildingUtil.java:130-132）。我们从 0 到 size.y-1（`registration.js:278`），含底板，中心也不同。
- [x] `select().layers(y, h)`：Java 把高度限制在 ySpan - y（:145-148），我们不限制（`registration.js:276`），选区会超出顶部，中心（旋转中心、`pointAt`）跟着偏。
- [x] Java 每个场景有自己的 util（:26）。我们共用一个，`everywhere`、`layer`、`layers`、`layersFrom`、`column` 跟着最后编译的场景的尺寸走（`registration.js:250、273-278`），运行时回调里调用会用错尺寸。
- [x] 选区的 `add`、`substract`：Java 原地修改并返回自己（SelectionImpl.java:43-54），我们总是返回新的（`R/level/ponder_level.js:19-20`），不接返回值的写法无效。
- [x] 选区没有 `getCenter()`（我们叫 `center()`）、`makeOutline()`、遍历和 `test()`（Selection.java:17-23）。

### 元素和场景对象

- [x] `PonderPalette` 的 `getColor()`、`getColorObject()` 没有，我们的颜色是普通数组（`R/lib/core.js:104`）。
- [x] `ElementLink` 的 `getId()`、`cast()` 没有（ElementLink.java:6-8）。我们的 link 是空对象，类型不对时不像 Java 那样报错（`R/foundation/ponder_scene.js:83-84`）。
- [x] `WorldSectionElement` 的 `setCenterOfRotation`、`stabilizeRotation`、`selectBlock`、`resetSelectedBlock`、`getAnimatedRotation`、`getAnimatedOffset`（WorldSectionElement.java:20-40）只有字段、没有方法（`elements.js:25-30`）。
- [x] `reset()` 时 Java 会清掉选中的方块（WorldSectionElementImpl.java:131-135），我们不清（`elements.js:31`）。
- [x] `isVisible()` 在 Java 是“可见且不空”（:194-196），我们只看 `visible`，`forEachVisible` 会带上空的区块。
- [x] 跳转进度时的 `whileSkipping()`（:282-288，由 PonderScene.seekToTime 调用）没有，往回跳也不报错（`ponder_scene.js:75-78`）。
- [x] 识别的射线：Java 撤销旋转的顺序是 X、Z、Y，不是 X、Y、Z 的严格逆变换（:199-236），我们用严格逆变换（`R/render/world_render.js:231-249`）。多个轴都转过的区块上，指到的方块可能不同（方块轮廓见“识别模式”）。
- [x] 重播时的注视点：Java 只重置追随的目标，注视点从原处滑过去（PonderScene.java:236、289-293），我们两个值都直接跳过去（`ponder_scene.js:44`）。重播后朝着注视点的鹦鹉看得出来。
- [x] `PonderElement` 的 `isVisible`、`setVisible`，`AnimatedSceneElement.setFadeVec`，`OutlinerElement.setColor` 只有字段。只影响自己写指令的作者。
- [x] PonderScene 的 `resolveOptional`、`runWith`、`applyTo`、`forEachWorldEntity`、`getSceneBuildingUtil`、`builder()` 和 `getWorld()` 等 getter 没有（PonderScene.java:367-436）。我们有 `resolve`、`linkElement`、`addElement`、`forEach`、`forEachVisible` 和 `world`、`transform`、`outliner` 这些字段。Create 的回调里 `getWorld()` 用了 5 次。

## 界面与操作

### 场景界面（PonderUI）

- [x] 按钮闪烁停了：`P.ticks` 只在两个索引界面里加（`R/ui/index_screens.js:76、137`），场景界面里识别、舒适阅读、下一个（场景放完）和高亮标签的脉冲不动。
- [ ] 物品提示框：Java 是完整的原版物品提示（稀有度颜色、附加行、Ponder 自己的一行），我们只有白色的名字（`R/ui/ponder_ui_render.js:46`、`R/ui/tag_screen.js:80`、`R/ui/index_screens.js:97`）。

### 识别模式

- [x] 射线按方块的实际轮廓求交（WorldSectionElementImpl.java:199-213，`ClipContext.Block.OUTLINE`），我们把每个非液体格子都当整格（`R/render/world_render.js:231-247`）。指着台阶、火把、栅栏格子里的空处也会识别到它。
- [x] 方块对应的物品：Java 用 `getCloneItemFromBlockstate`（PonderScene.java:203-213），我们只处理了点亮的红石灯和红石线（`R/blocks/blocks.js:154-157`）。墙上的火把、燃烧的熔炉、活塞头这类方块 id 和物品 id 不同的，名字会错或显示未翻译的键。

### 界面跳转

- [x] 返回时交接上下文：Java 是新界面对上一个调用 `shareContextWith`（ScreenOpener.java:43-45、PonderUI.java:1178-1183、440-458），我们是对要离开的界面调用（`R/ui/screens.js:96`），标签界面和基类也没有这个方法。效果：场景 → 标签 → 同一件物品，Java 会跳到旧场景界面里第一个带这个标签的场景，我们回到原处。
- [x] 返回按钮淡入：Java 从 0 淡入并滑动 5 像素（NavigatableSimiScreen.java:77-83），我们直接出现（`R/ui/screens.js:24-26`）。
- [x] 打开时的缩放：Java 第一个界面从一半大小放大进来（SimplePonderActions.java:13-31），我们直接全尺寸出现（`R/main.js:55-58`）。

### 思索界面里的“按住 W 思索”（PonderTooltipHandler）

物品栏不是 Ore UI 所以那里做不了，但识别模式、标签界面、索引界面里的物品提示是我们自己画的，这部分可以做。

- [ ] 按住 W 时进度条填满，然后从鼠标处放大跳到这件物品的场景（PonderTooltipHandler.java:49-79、165-188）。
- [x] 悬停的物品就是当前场景的主体时，进度条换成绿色的“本场景的主体”（PonderTooltipHandler.java:98-100、116-121）。
- [x] 提示框边框随进度从蓝变白（PonderTooltipHandler.java:138-163）。
- [x] 作者接口：悬停物品的回调和 `enable` 开关（PonderTooltipHandler.java:36、190-196）。
- 语言键 `ponder.ui.hold_to_ponder`、`ponder.ui.subject` 已有，没用上。

### 标签与索引

- [x] 索引排除：Java 只把排除的物品从物品索引里拿掉（PonderIndexScreen.java:50-58、160-164），我们排除后的列表（`R/foundation/registration.js:180-184`）还被当成“有没有场景”的判断（`R/main.js:52`、`R/ui/tag_screen.js:42`）。结果是被排除的物品用命令或使用物品都打不开，在标签界面里显示成缺失的按钮。这也和 `docs/reference/registration.md:161` 的说法矛盾。
- [x] 不存在的物品 id：Java 丢掉（PonderIndexScreen.java:70-71、PonderTagScreen.java:65-66），我们照样列出来（`R/ui/index_screens.js:41`、`R/ui/tag_screen.js:35`）。
- [x] 场景界面里的标签按钮：Java 显示这件物品关联的所有标签，包括不在列表里的，没注册的显示成屏障图标的 `not_registered`（PonderUI.java:165、PonderTagRegistry.java:83-86）。我们只显示列表里的标签（`R/ui/ponder_ui.js:15`），还会把主物品是这件物品、但没有关联的标签也加上。
- [x] 同一件物品加进一个标签两次：Java 用集合去重（PonderTagRegistry.java:88-95），我们是数组，会出现两个按钮（`R/foundation/registration.js:134-138`）。
- [x] 查没注册的标签：Java 返回屏障标签（PonderTagRegistry.java:27-29、73-76），我们返回 undefined（`R/foundation/registration.js:191`）。

### 快捷键、声音、鼠标

- [x] 点击音：Java 用原版 `ui.button.click`、界面音量较低，进度条不出声（PonderProgressBar.java:183-186）。我们所有控件都用音量 1 的 `random.click`，进度条也响（`R/ui/screens.js:53`、`R/lib/core.js:113-116`）。
- [x] 鼠标键：Java 的进度条只认左键（PonderButton.java:148-151），我们不看 `e.button`，右键、中键也能拖进度（`R/main.js:94-98`）。
- [ ] 触屏和手柄玩家也要用思索。现在只接了鼠标和键盘，自绘控件还需要接入触屏操作和手柄焦点导航，不能只依靠 Ore UI 自动支持（`R/main.js:91-110`）。

### 设置（CClient）

- [ ] `comfyReading` 不保存，页面重载就恢复关闭（`R/ui/ponder_ui.js:7、47`），Java 存在客户端配置里（CClient.java:7-8、PonderUI.java:1213-1219）。
- [ ] 设置界面：Java 从模组列表打开 “Client Settings”，我们没有。
- [ ] 界面缩放：Java 用玩家的界面大小设置，我们总是取能放下 320×240 的最大倍数（`R/lib/core.js:8-20`）。能不能读到玩家的设置未知。

## 注册接口（写插件的作者用）

- [x] 插件的写法：Java 是 `getModId()` 方法（PonderPlugin.java:11），我们是 `modId` 属性，另外多一个给标签索引用的 `name`（`R/foundation/registration.js:4-7`）。
- [x] `withKeyFunction` 没有（DefaultPonderSceneRegistrationHelper.java:23-26、DefaultPonderTagRegistrationHelper.java:24-27）。
- [x] 传数组或 Iterable：Java 有重载（DefaultPonderSceneRegistrationHelper.java:48-51），我们只收展开的参数（`R/foundation/registration.js:113、140-147`），传数组会把整个数组当成一个 id。
- [x] `excludeItemVariants`、`excludeBlockVariants` 没有（PonderIndexExclusionHelper.java:33-57），只有 `exclude(id 或判断函数)`（`R/foundation/registration.js:151-157`）。
- [x] 查询注册表：没有不经过排除的 `doScenesExistForId`、`getTags(物品)`、`getTagName`、`getSpecific`（SceneRegistryAccess.java:12-18、TagRegistryAccess.java:11-19、LangRegistryAccess.java:14-26）。

## 命令

- [ ] `/ponder tags` 没有（PonderCommand.java:31-33）：`tags` 被当成物品 id，弹出原版表单。
- [ ] `/ponder <场景> <玩家>`（权限 2，给别的玩家打开）没有（PonderCommand.java:38-43）。我们只有一个可选的字符串参数（`src/BP/scripts/index.js:51`）。
- [x] 参数类型：Java 是 ResourceLocation，只写 `spyglass` 会补成 `minecraft:spyglass`，格式错的直接拒绝（PonderCommand.java:34）。我们收任意字符串，只写 `spyglass` 会弹出原版表单。
- [ ] 物品没有场景时：Java 写日志、什么都不打开（SimplePonderActions.java:25-28），我们弹出原版表单（`R/main.js:53`、`R/bridge/bridge.js:126-135`）。

## 结构文件与适配器

- [x] 读 Java 的 `.nbt` 结构：之前定了要支持，现在只读基岩的 `.mcstructure`（`R/level/structure/nbt.js`）。要解 gzip、按大端读，还要把 Java 的方块 id 和状态换成基岩的。
- [x] 附属包贴图指向原版文件时找不到：农夫乐事的 terrain_texture.json 里 `beetroots_stage0` 这类条目指向 `textures/blocks/beetroots_stage_0`，文件在原版里、附属包没带。适配器在附属包里找不到文件后只拿名字去查原版的 terrain_texture.json（`tools/adapter/adapt.js:711-722`），原版的键名是 `beetroot`，所以 22 张作物贴图报“找不到”。游戏是按路径在资源包栈里往下找的，适配器也应该拿路径去原版里找。

## 发布前要改回来的

- [x] `P.DEBUG = true`（`R/lib/core.js:6`）：左下角显示最近 14 行日志，Java 没有。
- [ ] 打不开思索时（命令参数错、物品没有场景、附属包 `items` 里列了但没有场景的物品）会露出原版表单，上面是标记文字 `ponder:<id>#<时间>;`、附属包的 JSON 和 `ponder:close;` 按钮（`R/bridge/bridge.js:116-136`）。应该直接关掉。

## 平台做不到或已决定不做（备查）

暂停和原版改键相关项按已确认的平台限制不做，也不提供思索自己的改键设置。通用 Java 场景直接运行和完整 `String.format` 不列入必做；已有结构导入、跨命名空间共享文本和常用格式化保留。开发者编辑与调试工具、翻译文件生成、世界背景模糊不做。`debug()` 中用于播放场景的指令与回调接口保留，`debugSchematic` 排除；语言文件由作者维护，正常加载和缺译行为保留。以下保留原问题，不标为完成。

- 编辑模式（CClient `editingMode`）整套没有：
  - “Editor View”按钮（PonderUI.java:393-398）；
  - 底板上 x、z 坐标数字和 N/E/S/W 方位（PonderUI.java:675-720）；
  - 识别模式里金色或绿色的坐标提示；点方块复制 `util.grid().at(...)`，Shift 点复制 `select().position`，右键复制从上次复制的方块到这里的 `select().fromTo`（PonderUI.java:770-776、1039-1064）；
  - 底板方块可以被选中（PonderScene.java:190-196）；
  - 每次编译场景都重载全部插件（PonderSceneRegistry.java:81-98）；
  - 不查语言文件、直接显示注册的英文，缺的文字显示 “unregistered … entry” 和 “MISSING_SPECIFIC”（PonderLocalization.java:70-120）；
  - `ICON_PONDER_USER_MODE` 图标定义了没画（`R/lib/ui_render_helper.js:7`）。
  - 复制到剪贴板在 Ore UI 里能不能做，未知。
- Shift + 重播：Java 重载全部插件并重建这件物品的场景（PonderUI.java:550-568），我们只重放当前场景（`R/ui/ponder_ui.js:125`），改过的插件脚本也不会重新读。
- `editingMode`：见上面“场景界面”。
- `/ponder reload` 没有（PonderCommand.java:25-27）。每次打开会重新注册，但改过的插件脚本不会重新读。
- 背景：Java 是原版模糊的世界加菜单底图（AbstractSimiScreen.java:109-110），我们是一层平的 `rgba(16,16,16,150)`（`R/lib/ui_render_helper.js:79`），没有模糊。
- `debug()`（SceneBuilder.java:24）没有：`debugSchematic`、`addInstructionInstance`、`enqueueCallback`（DebugInstructions.java:9-13）。后两个就是 `addInstruction` 的别名，`enqueueCallback` 用了 3 次。
- 语言文件：Java 由 `PonderLocalization.provideLang` 在数据生成时写出（PonderLocalization.java:152-193），我们要作者手写 `.lang`。缺键时我们显示脚本里的英文（`R/lib/lang.js:18-21`），Java 不在编辑模式时显示键本身（PonderLocalization.java:74）。

- 暂停：Java 打开思索时单人游戏会暂停（PonderUI.java:1198-1201，其他三个界面一样），我们不暂停。脚本能不能做到未知。
- 快捷键：Java 用玩家绑定的丢弃、左、物品栏、右、下键，按键码匹配，按钮上显示绑定的键名（PonderUI.java:375、401、407、413、419，PonderButton.java:120-146）。我们写死 q/a/e/d/s、按输入的字符匹配、标签固定（`R/ui/ponder_ui.js:6、51`、`R/ui/screens.js:56-61`、`R/main.js:108`），改键无效，非 QWERTY 键盘也不对。
- 识别提示里的键名：Java 显示丢弃键绑定的名字（PonderUI.java:751-756），我们总是 “Q”（`R/ui/ponder_ui_render.js:44、78`）。
- 快捷键 PONDER（W）和分类 `key.categories.ponder`（PonderKeybinds.java:14-16）没有。en_US 有这两个键名但没用上，zh_CN 没有 `key.categories.ponder`。
- `sharedText`：Java 可以用任何命名空间的共享文字，替换用完整的 `String.format`（TextWindowElement.java:90-108、PonderLocalization.java:77-82）。我们只查场景自己的命名空间，只替换 `%n$s`（`R/foundation/registration.js:539`）。
- 物品栏里按住 W 思索：基岩的物品栏不是 Ore UI。入口改成使用注册过的物品或 `/ponder:ponder`。
- 命令名带命名空间（`/ponder:ponder`）：基岩的自定义命令必须带。
- DebugScenes 不移植，只有默认示例 scene_1 是特意要的。
- 暂停菜单里的按钮是 Create 的（OpenCreateMenuButton），不是 Ponder 的。
- 实体不画影子（已定）。
- 生物群系染色固定用平原（Java 思索的世界也是平原）。
- 方块 id 和状态用基岩版的。
- 字体用原版 Ore UI 的。
- 章节（PonderChapter、ChapterLabel）：Java 的 `PonderChapter.of` 返回 null，从来不会建出章节，界面上看不出差别。
- `placementAssist`（indicatorType、indicatorScale、PLACEMENT_INDICATOR_SHEET）：catnip 的准星放置提示，不属于思索界面。
- 实体没有 AI，动作由场景设置（已写进 `docs/reference/custom-content.md`）。
- `WorldInstructions.getHolderLookupProvider()`（WorldInstructions.java:23）：Java 的注册表访问，基岩没有对应的东西。
- 游戏里也是空引用的 16 个名字，不用补：10 张滞留药水贴图、骆驼的 `look_at_target`、村民的 `get_in_bed_baby`、玩家的 `controller.animation.player.base`、试炼刷怪笼的 `trial_spawner_base` 贴图、船和运输船的模型（船见“实体 / 画法”）。
- 试炼刷怪笼、饰纹陶罐作为实体没有模型：它们是方块实体，归方块渲染。
