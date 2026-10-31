# 开发验收包

测试原包在本目录。适配器分别处理主包、Debug 场景和农夫乐事依赖，然后只生成一个安装文件，包含测试所需的全部行为包和资源包。

在项目根目录运行：

```powershell
node tools/adapter/adapt.js latest --bundle "Ponder Debug" src packs/Debug "packs/FarmersDelightV5.0.5-26.0+"
node --test tools/adapter/adapt.test.js packs/Debug/bridge.test.js packs/Debug/render.test.js packs/Debug/material.test.js packs/Debug/entity.test.js
node packs/Debug/verify.js
```

产物为 `tools/output/<当前基岩版本>/Ponder Debug.mcaddon`。导入这一个文件，在测试世界中启用 `Ponder Debug Behavior` 及其关联资源包；Debug 的依赖声明包含主包和农夫乐事，所有依赖已放进同一个文件。

## 第 1 批验收

第一批 TODO 已于 2026-10-31 获用户确认通过，验收版本为主包 1.0.10 / Debug 1.0.8。用户明确本次计入 1 次正式游戏测试：累计 1/6 次，剩余 5 次；此前复杂排障不追溯计数，原“第 5 次”标记已撤销。游戏测试由用户进行，开发者只检查源码、离线宿主、用户产生的日志和转储。

主包 1.0.9 / Debug 1.0.7 已由用户确认实体颜色正常；1.0.10 / Debug 1.0.8 的猫基础姿态与羊后腿交界修正现也已确认成功。TODO 中本批“实体 / 数据”四项及“结构文件与适配器”的附属包贴图解析项均标为完成。猫、豹猫、北极熊的合并项和整体实体渲染项仍包含本批未完成或未覆盖的内容，保留未勾选。以下三项保留为本批验收清单，不要求再次测试。

1. `/ponder:ponder minecraft:slime_ball`：第一幕里史莱姆、岩浆怪直接可见，羊、猫、恼鬼有完整模型。约 5 秒后，右侧尖牙连续出现 4 次，每次升起、咬合并收缩消失。
2. 点下一场景：大小史莱姆向玻璃墙移动，各自在身体边缘贴墙时停下。大史莱姆的中心离墙更远，两者均不穿入墙里。
3. `/ponder:ponder minecraft:beetroot`：五排为甜菜、胡萝卜、马铃薯、小麦和火把花，每排从幼苗到成熟，作物图案可见，无紫黑缺图。

`verify.js` 从这一份产物检查所有包的 UUID、依赖版本及每个 Ore UI 资源包的 `content.zipe`。模拟环境仅允许读取带该标记的资源包，执行行为包的注册与命令入口，把表单标题先于标签交给 Ore UI，经过实际的桥接代码和动态插件加载后打开 `PonderUI`。随后运行三个场景各 360 tick 的实际帧回调、屏幕绘制和 `DrawList`，检查 DOM/CSS 输出、图片绑定、碰撞停靠、尖牙生命周期和 40 个作物方块的模型及贴图关联。报告保存在 `_sample/verification/batch1-report.json`，模拟环境的日志在 `batch1-runtime-log.json`；它们不运行原生 Gameface/GPU，也不代表游戏内视觉确认或原生崩溃已经解决。

## 实体出现时的进程崩溃

状态更新：1.0.8 用户实测已能显示 Debug 场景中的实体，暂未报告性能问题；1.0.9 的颜色及 1.0.10 的猫姿态、羊交界修正随后均获用户确认。该结论来自用户反馈与已落盘的持续绘制日志，不是开发者启动游戏验证。

2026-10-31 14:16 和 14:37 的两份故障转储 `Minecraft.Windows.exe.2976.dmp`、`Minecraft.Windows.exe.38944.dmp` 都显示，游戏的 `Rendering Pool(0)` 线程报出 `Disabling dynamic texture handles is not supported.`，经过 `terminate` / `abort` 以 `0xc0000409`、子码 7 退出。第二次已安装主包 1.0.7、Debug 1.0.5，说明图片节点复用修正没有消除崩溃。没有证据确认内存耗尽，也没有调试符号把这个状态变化追溯到某一条 Ponder 绘制调用。内容日志在崩溃前未完整写盘。调用栈保存在 `_sample/verification/batch1-crash-stack.txt` 和 `batch1-crash2-stack.txt`，诊断说明见 `batch1-crash-analysis.md`。

完整 DOM 检查复现了项目中的纹理复用问题：节点按绘制位置复用，实体插入、面排序和尖牙出现/消失会使同一个图片元素改绑其他纹理，也会重新创建 `geo-item://` 原生物品图标。现按图片地址保留节点，使用 `z-index` 更新绘制顺序，图片不因排序被替换或从 DOM 脱离。同一段 180 tick 的图片地址赋值由 3,028 次降至 349 次，原生史莱姆球图标由 7 次降至 1 次；这是脚本层的绑定次数，不是 GPU draw call 或纹理解码次数。对比见 `batch1-render-comparison.json`。这项优化继续保留，但第二次转储已证明它不足以解决崩溃。

当前候选修复参考用户指出的 `oreUI-temp`（`0da7322`），仅提取裁剪与滤镜顺序：贴图先裁到本面的 UV 区域，再在有尺寸限制的屏幕区域应用原来的滤镜。矩形 UV 仅用 overflow 裁剪，多边形设置 `shape-rendering:optimizeSpeed` 使用 Gameface 模板裁剪。保留原来的面排序，不引入该分支的逐面对比、相交多边形切分、滤镜组装和 DOM 重挂。没有导入该分支的旧资源或新增衍生贴图。

相同场景 180 tick 的 Node/mock-DOM 对比中，主包 1.0.7、`oreUI-temp` 绘制模块、1.0.8 裁剪方案的脚本绘制中位数分别为 2.135、24.184、5.141 ms；裁剪方案仍比 1.0.7 增加脚本开销。首次出现实体时，滤镜覆盖面积估算分别为 15,482,402、1,698,497、577,049 CSS 平方像素，裁剪方案较 1.0.7 减少约 96.3%。这些是离线脚本时间与 CSS 几何估算，不是游戏帧率、实际滤镜分配大小、显存或 GPU 调用次数；分支对比只替换 draw.js，没有测整个分支的游戏性能。记录见 `_sample/verification/draw-comparison.json`。随后用户已确认实体出现且性能暂时正常。

Ore UI 的 `render begin` 与 `render submitted` 记录实体列表、绘制数量、节点池大小、图片绑定总数和每段时间的最大 JavaScript 绘制耗时。当前增加 `mappedFaces` 和 `faceFilterPx`，分别表示本帧 UV 裁剪面数、这些面的滤镜覆盖面积估算（CSS 平方像素，不包含普通方块面及 UI 的滤镜）。实体列表变化时记录，稳定播放时每 5 秒记录；脚本提交完成不等于原生绘制完成，`maxJsMs` 也不包含 GPU 耗时。游戏内容日志仍有写盘缓冲。

## 日志与这次入口修正

此前的实机日志确认：请求与插件列表已完整收到，农夫乐事插件加载成功，Debug 插件报 `Cannot load plugin script ponder_addons/ponder_batch1/plugin.js`。已安装 Debug 包的脚本内容与源文件一致，但根目录漏了 `content.zipe`，因此游戏不读取该包的 `hbui/` 文件。现已在 `RP/content.zipe` 补上零字节标记；适配器也会为包含 `hbui/` 且缺少该文件的资源包补齐，已有内容原样保留。故障实机日志摘录保存在 `_sample/verification/batch1-game-load-failure.log`。

标题和首个标签仍各自携带完整请求；桥接层只处理完整请求，并检查插件脚本确实完成注册。加载失败会记录原因，下次打开可重试。

`bridge.test.js` 覆盖字段分批到达、过期数据、快速切换、关闭期间加载、加载失败与超时、脚本异常及文件日志；适配器检查另行覆盖缺失标记的修复与已有文件的保留。`render.test.js` 覆盖实体插入与排序、隐藏与再次显示、图片和文字混排、节点数量达到峰值后保持稳定，并检查 UV 翻转/旋转/不同 GUI 缩放、极小 UV 区域的滤镜边界、多边形模板裁剪、同图不同画法的复用以及无效坐标。`material.test.js` 覆盖原版与附属包材质继承、遮罩透明度、原色保留、图片去重、图片解码和运行时滤镜。`entity.test.js` 覆盖猫的成年/幼年姿态与控制器、模型替换保护、羊的四方向与行走表面完整性、姿态缓存、隐藏骨骼和不同材质。当前共 51 项检查。修正版主包产物版本为 `1.0.10`，Debug 为 `1.0.8`，以便替换已经导入的版本。更新后需重新进入测试世界，让行为脚本和 Ore UI 页面重新加载。

## 实体过亮的修正

旧实体滤镜用 alpha × 255 模拟不透明/镂空材质，Gameface 的颜色矩阵会把未钳制的输出 alpha 同时乘入 RGB，导致白黄或红橙色饱和。仅把系数改成 1 又会误把羊和岩浆怪贴图的材质遮罩当作透明度：当前原版羊贴图有 593 个 alpha=3 的像素，岩浆怪有 96 个 alpha=29 和 1,280 个 alpha=126 的像素。

适配器现在读取同一份当前游戏的 material 继承、增减 flags 和 variants，仅提取 alpha 规则；在离线打包时将不透明、普通镂空、遮罩/发光材质的可见度转换为图片 alpha，保持原始 RGB 不变。运行时矩阵的 alpha 系数限制在 0～1，半透明外壳继续用原图，多层贴图的后续混合层继续用原图。无需转换的猫/尖牙等贴图不新增文件，转换结果按内容哈希共享文件。当前包产生 252 张转换后的 PNG，合计 229,663 字节；它们来自当前基岩贴图，未引入 Java 贴图。

1.0.9 的颜色修正没有增加面数、滤镜层数或每帧多边形计算。其三个离线场景各 360 tick 的绘制数量及图片绑定峰值与 1.0.8 一致。Pillow 独立读取最终包的 254 处转换图片引用，检查 252 张独立 PNG 的 RGB 逐像素保持原样、alpha 与材质规则一致；结果见 `_sample/verification/entity-colour-pixels.json`。用户现已确认实体颜色正常。发光强度、染色遮罩完整实现等原 TODO 仍待其对应批次处理；本次没有勾选新 TODO。

## 猫姿态与羊腿交界修正

当前正式版安装包内，成年猫相同几何在基础资源层保留 body、tail1、tail2 的 `bind_pose_rotation`，较新的模型定义省略了它们。适配器仅在骨骼父子关系、支点和方盒形状一致且未指定旋转时补回这些值；这是当前安装包的资源层，不引用其他版本。幼猫及附属包自定义模型保留自己的姿态。动画控制器原本已引用；另外补齐由原生代码提供的猫状态默认值，静止时使用 walking 状态，场景仍可通过查询或显式变量控制坐下、潜行等动作。

羊的凹洞由埋在身体里的腿顶面按平均深度盖到外表面造成。渲染器现在按不透明封闭方盒相交关系裁掉内部表面，结果按姿态和可见性缓存；仅转动相机不会重算。镂空、半透明、开放和扁平部件不参与这项裁剪。保留现有图片绑定、先裁剪后滤镜和场景排序方式。

离线四方向静止羊由 72 个提交面降到 33～39 个；独立逐采样深度检查确认裁剪保留最近表面与轮廓。相同第一幕 240 tick 的 Node/mock-DOM 对比中，静止场景绘制中位数由 4.938 ms 到 4.384 ms；让羊持续摆腿时由 5.206 ms 到 5.181 ms。数据仅表示离线 JavaScript 时间，不是游戏帧率或 GPU 耗时。见 `_sample/verification/entity-render-comparison.json` 和 `batch1-entity-pose.md`。游戏中的猫姿态与羊交界处已由用户确认修正成功。

Ore UI 使用当前原版的 `vanillaCoreDduiContentLogCommandGroup.log(message, level)` 写入内容日志。Ponder 记录包含 `[Ponder ...]` 标识、页面会话和递增序号；行为包注册与打开记录包含 `[Ponder/BP]`。注册列表、脚本路径、场景索引结果、打开失败和未捕获异常都会记录。关闭屏幕上的调试文字不影响文件日志。

Windows 正式版日志位于 `%APPDATA%/Minecraft Bedrock/logs/ContentLog*.txt`。本次已在实机日志中确认 Ore UI 与行为包的记录都能写入，用户只需描述现象，开发者可直接读取本机最新文件。`node packs/Debug/read-log.js` 读取最新文件中的 Ponder 记录，不修改游戏设置。游戏写盘有缓冲，刚报错时文件末尾可能尚未更新；需结合文件更新时间判断，不能直接当作没有记录。模拟验证日志和实际游戏日志需区分。
