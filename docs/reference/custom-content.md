# 接口参考：自定义方块、粒子与实体

场景里出现你自己的方块、粒子或实体时，需要告诉 Ponder 怎么画它们。`packs/Gathering` 里有这三样的完整例子。

## 方块模型

原版方块按游戏的贴图和外形画（外形来自 Scaffold，见[概述](../overview.md)的致谢），带动画的贴图会动。附属包自己的方块（行为包 `blocks/` 里定义的）也不用注册：把整个附属包（行为包和资源包）放进 `tools/input/` 跑一遍适配器，适配器会在资源包的 `hbui/ponder_addons/<文件夹>/` 下写一份 `ponder_blocks.json`，Ponder 按方块定义里的 `minecraft:geometry`、`minecraft:material_instances`、`minecraft:transformation` 和 `permutations` 来画。场景里直接写方块 id 和状态，例如 `P.block("farmersdelight:stove", { "farmersdelight:is_working": true })`。例子见 `packs/FarmersDelightV5.0.5-26.0+`。

自动画法支持整块（`minecraft:geometry.full_block`，或不写 geometry）、`minecraft:geometry.cross`、资源包里的模型文件（逐面 UV、骨骼和方块的旋转、`bone_visibility`），以及按方块状态生效的 permutations。不支持 box UV 和 `tint_method` 染色。

游戏里不存在的方块（只在场景里出现），或者想换掉自动画法时，在插件脚本里注册：

```js
P.registerBlockModel("my_mod:widget", block => ({
  shape: "cube",
  opaque: true,
  faces: {
    up: "/hbui/ponder_addons/my_mod/textures/blocks/widget_top.png",
    down: "/hbui/ponder_addons/my_mod/textures/blocks/widget_bottom.png",
    north: "/hbui/ponder_addons/my_mod/textures/blocks/widget_side.png",
    south: "/hbui/ponder_addons/my_mod/textures/blocks/widget_side.png",
    west: "/hbui/ponder_addons/my_mod/textures/blocks/widget_side.png",
    east: "/hbui/ponder_addons/my_mod/textures/blocks/widget_side.png",
  },
  tint: null,
}));
```

| 字段 | 说明 |
| --- | --- |
| `shape` | `"cube"` 是完整方块，`"wire"` 是红石粉那样的薄片 |
| `opaque` | 不透明的方块会挡住后面的面 |
| `faces` | 六个面的贴图，是资源包里的路径 |
| `tint` | 染色，`[红, 绿, 蓝]`，分量从 0 到 1。不染色时给 `null` |

这个函数对每种方块状态只调用一次，可以按 `P.blockStates(block)` 返回不同的贴图。

贴图也可以用原版资源包的，路径写成 `pack://textures/blocks/stone.png?filtering=point`。

## 粒子

继承 `P.Particle`，实现 `sprite()`。`sprite()` 返回 `{ src, u, v, size, texSize }`：从 `texSize` 见方的贴图里，取 `u, v` 起 `size` 见方的一块。

```js
class SparkParticle extends P.Particle {
  constructor(world, x, y, z, mx, my, mz) {
    super(world, x, y, z, mx, my, mz);
    this.lifetime = 20;
    this.gravity = 1;
  }
  sprite() {
    return { src: "/hbui/ponder_addons/my_mod/textures/spark.png", u: 0, v: 0, size: 8, texSize: 8 };
  }
}

const spark = { make: (world, x, y, z, mx, my, mz) => new SparkParticle(world, x, y, z, mx, my, mz) };
```

然后传给 `emitParticles` 或 `simpleParticleEmitter`：

```js
scene.effects.emitParticles(
  util.vector.topOf(2, 1, 2),
  scene.effects.simpleParticleEmitter(spark, [0, 0.1, 0]),
  4, 10,
);
```

`P.Particle` 对应 Java 的 `Particle`，已处理寿命、重力、阻力和与方块的碰撞。构造函数里可以改这些字段：

| 字段 | 说明 |
| --- | --- |
| `lifetime` | 存活 tick，默认 `4 / (随机 × 0.9 + 0.1)` 取整 |
| `gravity` | 重力系数，每 tick 竖直速度减 `0.04 × gravity`，默认 0 |
| `friction` | 每 tick 速度乘的系数，默认 0.98 |
| `quadSize` | 大小，单位是方块 |
| `xd`、`yd`、`zd` | 速度。构造时已按传入的运动向量加了随机扰动 |
| `halfWidth`、`height` | 碰撞箱，默认 0.1 和 0.2 |

要穿过方块就重写 `move(dx, dy, dz)`，直接加到 `x`、`y`、`z` 上。要随时间换帧就在 `sprite()` 里按 `this.age` 和 `this.lifetime` 算 `u`、`v`。大小随时间变化时重写 `getQuadSize(pt)`。

## 实体

继承 `P.PonderEntity`，实现 `tick()` 和 `render(场景矩阵, 插值, 每方块像素)`。`render` 返回 `{ depth, draw(d) }` 的数组：`depth` 是图形中心变换后的 z，和方块一起从小到大绘制；`draw` 收到画布后画上去。

下面是一个慢慢上浮的方块，画法和 `packs/Gathering` 里的点燃 TNT 相同：

```js
const M = P.Mat;

class FloatingBlock extends P.PonderEntity {
  constructor(world, x, y, z, block) {
    super(world, x, y, z);
    this.block = block;
    this.halfWidth = 0.49; this.height = 0.98;
  }
  tick() {
    super.tick();
    this.xo = this.x; this.yo = this.y; this.zo = this.z;   // 上一 tick 的位置，用来插值
    this.move(0, 0.02, 0);
    if (this.tickCount >= 100) this.discard();
  }
  render(base, pt, blockPx) {
    const m = M.translate(base, P.lerp(pt, this.xo, this.x), P.lerp(pt, this.yo, this.y) + 0.5, P.lerp(pt, this.zo, this.z));
    const centre = M.apply(m, 0, 0, 0);
    return [{ depth: centre[2], draw: d => P.drawBlockCube(d, m, this.block, blockPx) }];
  }
}
```

生成和修改：

```js
const link = scene.effects.createEntity(world => new FloatingBlock(world, 2.5, 1, 2.5, "minecraft:stone"));
scene.idle(40);
scene.effects.modifyEntity(link, entity => entity.discard());
```

`P.PonderEntity` 提供：

| 字段 / 方法 | 说明 |
| --- | --- |
| `x`、`y`、`z`，`xo`、`yo`、`zo` | 当前和上一 tick 的位置。`y` 是碰撞箱底部 |
| `xd`、`yd`、`zd` | 速度，`setDeltaMovement([x, y, z])` 一次设置 |
| `halfWidth`、`height` | 碰撞箱，默认 0.25 和 0.25 |
| `onGround` | 上一次 `move` 是否落在方块上 |
| `tickCount` | `super.tick()` 每次加一 |
| `move(dx, dy, dz)` | 按碰撞箱移动，撞到方块的方向会停下并把该方向的速度清零。不加重力 |
| `discard()` | 移除 |

重力、阻力都要在 `tick()` 里自己写，例如 `this.yd -= 0.04`。实体落到 y ≤ -0.5 时被移除。

`render` 里可用的绘制工具：

| 工具 | 说明 |
| --- | --- |
| `P.Mat` | 4×4 矩阵：`translate`、`scale`、`rotX`、`rotY`、`rotZ`、`apply` |
| `P.drawBlockCube(d, 矩阵, 方块, 每方块像素)` | 以矩阵原点为中心画一个方块 |
| `P.drawItemSprite(d, 矩阵, 物品 id, 每方块像素)` | 以矩阵原点为中心画一件物品的平面图标 |
