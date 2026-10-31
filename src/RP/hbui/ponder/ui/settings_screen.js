// CClient's settings, reached from the Ponder screens because Bedrock has no mod list.
(function () {
  const P = window.Ponder;
  class PonderSettingsScreen extends P.Screen {
    init() {
      super.init();
      this.rows = [];
      const add = (label, value, click) => {
        const y = 42 + this.rows.length * 24, b = new P.PonderButton(this.width / 2 + 55, y, 64, 16).withCallback(click);
        this.rows.push({ label, value, button: b }); this.widgets.push(b);
      };
      add("ponder.ui.slow_text", () => P.settings.comfyReading, () => { P.settings.comfyReading = !P.settings.comfyReading; P.saveSettings(); });
    }
    isEquivalentTo(other) { return other instanceof PonderSettingsScreen; }
    render(mx, my, pt) {
      const d = this.d;
      d.begin(); this.renderBackTrack(d, mx, my, pt);
      d.centeredText(P.translate("ponder.ui.settings"), this.width / 2, 22, P.C.TEXT, true);
      this.rows.forEach(row => {
        const label = P.translate(row.value() ? "options.on" : "options.off");
        d.text(P.translate(row.label), this.width / 2 - 120, row.button.y + 4, P.C.TEXT, true);
        row.button.render(d, mx, my, pt);
        d.centeredText(label, row.button.x + 32, row.button.y + 4, P.C.TEXT, true);
      });
      if (this.backTrack) this.backTrack.render(d, mx, my, pt);
      if (this.exitButton) this.exitButton.render(d, mx, my, pt);
      this.renderBackTrackCaption(d); d.end();
    }
  }
  P.PonderSettingsScreen = PonderSettingsScreen;
})();
