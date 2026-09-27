/**
 * Plays the timeline forward one entry at a time: the "play" of the time
 * machine.
 *
 * Pure scheduling, no DOM, so the host decides what a step means (the slider
 * moves its handle and the globe shows the month). The one rule that matters
 * is that playback never outruns the imagery: the host says whether the entry
 * it was last asked for is on screen yet, and the player holds on it until it
 * is. Without that, the readout would race ahead of a globe still showing a
 * month from a few steps back, and the time-lapse would be a lie.
 *
 * Playback stops on the newest entry, like a video reaching its end, rather
 * than looping: a loop would keep downloading imagery for as long as the page
 * stayed open. Pressing play at the end starts again from the first entry.
 */

export interface TimePlayerHost {
  /** Where the playhead is now. */
  index(): number;
  /** How many entries the record has. */
  length(): number;
  /** Move to an entry; the host shows it. */
  go(index: number): void;
  /** True once the entry last asked for is on screen. */
  ready(): boolean;
  /** False once the host is gone (its slider was rebuilt, say). */
  alive?(): boolean;
  /** Told whenever playback starts or stops, for any reason. */
  onPlayingChange?(playing: boolean): void;
}

export interface TimePlayerOptions {
  /** Time each entry stays on screen once it has arrived. */
  frameMs?: number;
  /** How often to look again while an entry is still loading. */
  pollMs?: number;
}

/** ~4.5 entries a second: a year of months in under three seconds. */
export const DEFAULT_FRAME_MS = 220;

export class TimePlayer {
  private readonly frameMs: number;
  private readonly pollMs: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private isPlaying = false;
  /** The current entry was not on screen at the last look. */
  private waiting = false;
  /** Where this playback ends: the record's end, or a story's last month. */
  private stopAt = 0;

  constructor(
    private readonly host: TimePlayerHost,
    options: TimePlayerOptions = {}
  ) {
    this.frameMs = options.frameMs ?? DEFAULT_FRAME_MS;
    this.pollMs = options.pollMs ?? 60;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  /**
   * Play forward, to the record's end or to `until` (a story's last entry).
   * From the end there is nothing ahead, so play means "from the top".
   */
  play(until?: number): void {
    if (this.isPlaying || this.host.length() < 2) return;
    const last = this.host.length() - 1;
    this.stopAt = Math.min(last, Math.max(0, until ?? last));
    if (this.host.index() >= this.stopAt) this.host.go(0);
    this.setPlaying(true);
    this.schedule(this.frameMs);
  }

  pause(): void {
    if (!this.isPlaying) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.waiting = false;
    this.setPlaying(false);
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private tick(): void {
    if (!this.isPlaying) return;
    if (this.host.alive && !this.host.alive()) {
      this.pause();
      return;
    }
    // Hold on an entry that has not arrived: the frame time starts counting
    // only once it is actually on screen, so a slow month is seen for as long
    // as a cached one rather than flashing past the moment it lands.
    if (!this.host.ready()) {
      this.waiting = true;
      this.schedule(this.pollMs);
      return;
    }
    if (this.waiting) {
      this.waiting = false;
      this.schedule(this.frameMs);
      return;
    }
    const next = this.host.index() + 1;
    if (next > this.stopAt) {
      this.pause();
      return;
    }
    this.host.go(next);
    this.schedule(this.frameMs);
  }

  private setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    this.host.onPlayingChange?.(playing);
  }
}
