export interface EntityCardModel {
  title: string;
  fields: { label: string; value: string }[];
  note?: string;
  following: boolean;
}

/**
 * A small readout for the selected thing. It sits on the left on a desktop
 * and above the bottom dock on a phone, clear of the globe's centre.
 */
export class EntityCard {
  readonly root: HTMLElement;
  onFollow: (() => void) | null = null;
  onClose: (() => void) | null = null;
  private readonly titleEl: HTMLElement;
  private readonly fieldsEl: HTMLElement;
  private readonly noteEl: HTMLElement;
  private readonly followBtn: HTMLButtonElement;

  constructor(parent: HTMLElement = document.body) {
    const root = document.createElement("aside");
    root.className = "entity-card";
    root.hidden = true;
    root.setAttribute("aria-live", "polite");

    const head = document.createElement("div");
    head.className = "entity-card__head";
    this.titleEl = document.createElement("h2");
    this.titleEl.className = "entity-card__title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "entity-card__close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "Close";
    close.addEventListener("click", () => this.onClose?.());
    head.append(this.titleEl, close);

    this.fieldsEl = document.createElement("dl");
    this.fieldsEl.className = "entity-card__fields";
    this.noteEl = document.createElement("p");
    this.noteEl.className = "entity-card__note";

    this.followBtn = document.createElement("button");
    this.followBtn.type = "button";
    this.followBtn.className = "entity-card__follow";
    this.followBtn.textContent = "Follow";
    this.followBtn.addEventListener("click", () => this.onFollow?.());

    root.append(head, this.fieldsEl, this.noteEl, this.followBtn);
    parent.append(root);
    this.root = root;
  }

  show(model: EntityCardModel): void {
    this.root.hidden = false;
    this.root.dataset.following = String(model.following);
    this.titleEl.textContent = model.title;
    this.fieldsEl.replaceChildren();
    for (const field of model.fields) {
      const row = document.createElement("div");
      const label = document.createElement("dt");
      label.textContent = field.label;
      const value = document.createElement("dd");
      value.textContent = field.value;
      row.append(label, value);
      this.fieldsEl.append(row);
    }
    this.noteEl.hidden = !model.note;
    this.noteEl.textContent = model.note ?? "";
    this.followBtn.setAttribute("aria-pressed", String(model.following));
    this.followBtn.textContent = model.following ? "Following" : "Follow";
  }

  setNote(note: string): void {
    this.noteEl.hidden = note === "";
    this.noteEl.textContent = note;
  }

  hide(): void {
    this.root.hidden = true;
    delete this.root.dataset.following;
  }
}
