import { STORIES, type Story } from "../lib/stories";
import { formatYm } from "../lib/timeline";
import { ICONS } from "./icons";
import { markStoriesWelcomed } from "../lib/storiesWelcome";

/**
 * The card shown while a story (lib/stories.ts) plays. It is loaded only once
 * a story is asked for: the one-line invitation a first visit sees is plain
 * markup in index.html, so the stories cost the entry chunk nothing.
 *
 * The card names the story, says what to watch for, and offers Replay and
 * Next. It is not a live region: starting a story announces its title once
 * (through the app's announcer), and the dock's month readout carries the
 * progress, as it does for any playback.
 */
export interface StoryCardHandlers {
  /** Play a story: switch layer, fly, and run its months. */
  play(story: Story): void;
  /** Story mode is over (closed); undo what it switched on. */
  end(): void;
  /**
   * Record the story as a video: `replay` plays it from the top, and the
   * promise settles once the file is saved (or the recording failed).
   */
  save?(story: Story, replay: () => void): Promise<void>;
  announce?(message: string): void;
}

export class StoryCard {
  private readonly card: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly blurb: HTMLElement;
  private readonly replayBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private index = -1;

  constructor(
    root: HTMLElement,
    private readonly handlers: StoryCardHandlers
  ) {
    this.card = document.createElement("section");
    this.card.className = "stories__card";
    this.card.setAttribute("aria-label", "Story");
    this.card.hidden = true;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "stories__close";
    close.innerHTML = ICONS.close;
    close.setAttribute("aria-label", "Close stories");
    close.title = "Close stories";
    close.addEventListener("click", () => this.close());

    this.eyebrow = document.createElement("p");
    this.eyebrow.className = "stories__eyebrow";
    this.title = document.createElement("h2");
    this.title.className = "stories__title";
    this.blurb = document.createElement("p");
    this.blurb.className = "stories__blurb";

    const actions = document.createElement("div");
    actions.className = "stories__actions";
    this.replayBtn = document.createElement("button");
    this.replayBtn.type = "button";
    this.replayBtn.className = "stories__button";
    this.replayBtn.textContent = "Replay";
    this.replayBtn.addEventListener("click", () => this.show(this.index));
    this.nextBtn = document.createElement("button");
    this.nextBtn.type = "button";
    this.nextBtn.className = "stories__button stories__button--primary";
    this.nextBtn.addEventListener("click", () =>
      this.show((this.index + 1) % STORIES.length)
    );
    // Save video replays the story from the top and records it. While it
    // records, the button says so and waits; the recording ends when the
    // playback does, so Next or Close (which stop it) end it early.
    this.saveBtn = document.createElement("button");
    this.saveBtn.type = "button";
    this.saveBtn.className = "stories__button";
    this.saveBtn.textContent = "Save video";
    this.saveBtn.addEventListener("click", () => void this.save());
    actions.append(this.replayBtn, this.nextBtn, this.saveBtn);

    this.card.append(close, this.eyebrow, this.title, this.blurb, actions);
    this.card.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      this.close();
    });

    root.append(this.card);
  }

  /** The story on screen, if any: the share link carries its id. */
  get activeId(): string | undefined {
    return this.index >= 0 ? STORIES[this.index].id : undefined;
  }

  /** Present and play a story; its number is its place in STORIES. */
  show(index: number): void {
    const story = STORIES[index];
    if (!story) return;
    this.index = index;
    markStoriesWelcomed();
    this.card.hidden = false;
    this.eyebrow.textContent = `Story ${index + 1} of ${STORIES.length} · ${formatYm(story.from)} – ${formatYm(story.to)}`;
    this.title.textContent = story.title;
    this.blurb.textContent = story.blurb;
    const next = STORIES[(index + 1) % STORIES.length];
    this.nextBtn.textContent = "Next story";
    this.nextBtn.title = `Next: ${next.title}`;
    this.handlers.announce?.(`Story: ${story.title}`);
    this.handlers.play(story);
  }

  /** Play a story by its link id; false if there is no such story. */
  showById(id: string): boolean {
    const index = STORIES.findIndex((s) => s.id === id);
    if (index < 0) return false;
    this.show(index);
    return true;
  }

  /** Leave story mode: the card goes, and the story's switches are undone. */
  close(): void {
    if (this.index < 0) return;
    this.index = -1;
    this.card.hidden = true;
    this.handlers.end();
  }

  private async save(): Promise<void> {
    const story = STORIES[this.index];
    if (!story || !this.handlers.save || this.saveBtn.disabled) return;
    const index = this.index;
    this.saveBtn.disabled = true;
    this.saveBtn.textContent = "Recording…";
    this.saveBtn.classList.add("is-recording");
    try {
      await this.handlers.save(story, () => this.show(index));
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.textContent = "Save video";
      this.saveBtn.classList.remove("is-recording");
    }
  }

  /** Story mode ends quietly when the reader goes elsewhere (a new layer). */
  dismiss(): void {
    this.close();
  }
}
