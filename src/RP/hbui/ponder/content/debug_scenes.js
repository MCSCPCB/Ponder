// DebugScenes on the spyglass: only coordinateScene, the one vanilla blocks can show.
// structures/debug/scene_1.nbt is copied from Ponder (see assets/NOTICE.txt).
(function () {
  const P = window.Ponder;

  P.registerScene({
    id: "debug_coords", items: ["minecraft:spyglass"], tags: ["highlight_all"], schematic: "debug/scene_1.nbt",
    storyboard(scene, util) {
      scene.title("debug_coords", "Coordinate Space");
      scene.showBasePlate();
      scene.idle(10);
      scene.world.showSection(util.select.layersFrom(1), "DOWN");

      const xAxis = util.select.fromTo(2, 1, 1, 4, 1, 1);
      const yAxis = util.select.fromTo(1, 2, 1, 1, 4, 1);
      const zAxis = util.select.fromTo(1, 1, 2, 1, 1, 4);

      scene.idle(10);
      scene.overlay.showOutlineWithText(xAxis, 20)
        .colored(P.Palette.RED)
        .text("Das X axis");
      scene.idle(20);
      scene.overlay.showOutlineWithText(yAxis, 20)
        .colored(P.Palette.GREEN)
        .text("Das Y axis");
      scene.idle(20);
      scene.overlay.showOutlineWithText(zAxis, 20)
        .colored(P.Palette.BLUE)
        .text("Das Z axis");
    },
  });
})();
