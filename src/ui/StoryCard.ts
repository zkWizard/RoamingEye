import { STORIES, type Story } from "../lib/stories";
import { formatYm } from "../lib/timeline";
import { ICONS } from "./icons";

/**
 * The stories surface (lib/stories.ts): a compact invitation on a first visit,
 * and a card while a story plays.
 *
 * The invitation is one line, "Watch the planet change", because a first
 * visit is also every shared link's arrival and every test's boot: a large
 * card there would sit over the globe the visitor came to see. The card only
 * appears once someone asks for a story.
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
  announce?(message: string): void;
}

const WELCOME_KEY = "roamingeye:stories-welcome";

export class StoryCard {
  private readonly invite: HTMLButtonElement;
  private readonly card: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly blurb: HTMLElement;
  private readonly replayBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private index = -1;

  constructor(
    root: HTMLElement,
    private readonly handlers: StoryCardHandlers
  ) {
    root.classList.add("stories");

    this.invite = document.createElement("button");
    this.invite.type = "button";
    this.invite.className = "stories__invite";
    this.invite.innerHTML = `${ICONS.play}<span>Watch the planet change</span>`;
    this.invite.hidden = true;
    this.invite.addEventListener("click", () => {
      this.markWelcomed();
      this.show(0);
    });

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
    actions.append(this.replayBtn, this.nextBtn);

    this.card.append(close, this.eyebrow, this.title, this.blurb, actions);
    this.card.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      this.close();
    });

    root.append(this.invite, this.card);
  }

  /** The story on screen, if any: the share link carries its id. */
  get activeId(): string | undefined {
    return this.index >= 0 ? STORIES[this.index].id : undefined;
  }

  /**
   * Offer the stories once, to a visitor with nothing to go on. Any answer
   * (a story, or closing one) retires the invitation for good.
   */
  offerWelcome(): void {
    if (this.index >= 0 || this.welcomed()) return;
    this.invite.hidden = false;
  }

  /** Present and play a story; its number is its place in STORIES. */
  show(index: number): void {
    const story = STORIES[index];
    if (!story) return;
    this.index = index;
    this.invite.hidden = true;
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
    this.markWelcomed();
    this.show(index);
    return true;
  }

  /** Leave story mode: the card goes, and the story's switches are undone. */
  close(): void {
    if (this.index < 0) return;
    this.index = -1;
    this.card.hidden = true;
    this.markWelcomed();
    this.handlers.end();
  }

  /** Story mode ends quietly when the reader goes elsewhere (a new layer). */
  dismiss(): void {
    this.close();
  }

  private welcomed(): boolean {
    try {
      return localStorage.getItem(WELCOME_KEY) === "done";
    } catch {
      return false;
    }
  }

  private markWelcomed(): void {
    this.invite.hidden = true;
    try {
      localStorage.setItem(WELCOME_KEY, "done");
    } catch {
      /* private mode: the invitation just returns next visit */
    }
  }
}
