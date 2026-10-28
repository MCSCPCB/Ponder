// The built-in plugin, Java's BasePonderPlugin: Ponder's shared text.
(function () {
  const P = window.Ponder;

  P.addPlugin({
    modId: "ponder",
    name: "Ponder",
    registerSharedText(helper) {
      helper.registerSharedText("sneak_and", "Sneak +");
      helper.registerSharedText("ctrl_and", "Ctrl +");
    },
  });
})();
