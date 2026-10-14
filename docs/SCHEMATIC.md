# 场景结构（Schematic）

对应 Java Ponder 的 `PonderScene` 加载的 `.nbt`。场景的世界内容来自一个 `.mcstructure`，
时间轴指令（`showSection`、`setBlocks` 等）只决定什么时候让哪一部分可见。

## 文件位置

`src/BP/structures/ponder/<name>.mcstructure`

脚本通过 `world.structureManager.getPackStructureIds()` 枚举。实际得到的标识符
以游戏内输出为准，注册时只写文件名，不在代码里硬编码命名空间。

## 读取方式

`Structure.size` 取尺寸，`Structure.getBlockPermutation({x, y, z})` 取每格的方块与状态
（`permutation.type.id` + `permutation.getAllStates()`）。空位返回 `undefined`。
会话开始时把结构读成内存里的稀疏方块表，之后所有显示、隐藏、替换都对这张表操作，
不再访问 Structure 对象。

注意：`Structure` 在受限执行模式下不可用，读取必须在可写 tick 内完成。

## 与 Java 的分工

| Java | 这里 |
| --- | --- |
| `.nbt` 放整个场景世界 | `.mcstructure` 放整个场景世界 |
| `scene.world().showSection(selection, dir)` | 选区取自结构方块表，使其可见 |
| `scene.world().setBlocks(...)` | 对方块表打补丁 |
| `configureBasePlate(x, z, size)` | 同名，决定底板范围 |
| 结构里的实体 | 暂不读取（`Structure` 脚本接口没有实体访问） |

## 待你提供或确认

1. 至少一个 `.mcstructure` 作为首个演示。可在游戏里用结构方块导出，或由我提供脚本在测试世界生成后导出。
2. 放入后在游戏里运行一次枚举，把 `getPackStructureIds()` 的实际输出发给我。
