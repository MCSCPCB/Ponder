import { deferred } from "../fixtures.mjs";
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
export const forms = [];
export const uiManager = {
  closed: [], resolveOnClose: true,
  closeAllForms(player) {
    this.closed.push(player.id);
    if (this.resolveOnClose) for (const form of forms.filter(f => f.player === player))
      form.answer({ canceled: true, cancelationReason: FormCancelationReason.UserClosed });
  },
};
export class ActionFormData {
  slots = [];
  title(value) { this.titleText = value; return this; }
  body(value) { this.bodyText = value; return this; }
  button(text, icon) { this.slots.push({ text, icon }); return this; }
  show(player) {
    const pending = deferred();
    this.player = player; this.settled = false;
    this.answer = value => { this.settled = true; pending.resolve(value); };
    this.fail = error => { this.settled = true; pending.reject(error); };
    forms.push(this);
    return pending.promise;
  }
}
export function resetForms() { forms.length = 0; uiManager.closed = []; uiManager.resolveOnClose = true; }
