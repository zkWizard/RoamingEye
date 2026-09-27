import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimePlayer, type TimePlayerHost } from "./timePlayer";

/** A record of `length` entries whose images arrive when `loaded` says so. */
function fakeHost(length: number, start: number) {
  const state = {
    index: start,
    loaded: new Set<number>(),
    alive: true,
    changes: [] as boolean[],
    visits: [start] as number[],
  };
  // Everything is on screen at once unless a test says otherwise.
  const allLoaded = () => {
    for (let i = 0; i < length; i++) state.loaded.add(i);
  };
  allLoaded();
  const host: TimePlayerHost = {
    index: () => state.index,
    length: () => length,
    go: (i) => {
      state.index = i;
      state.visits.push(i);
    },
    ready: () => state.loaded.has(state.index),
    alive: () => state.alive,
    onPlayingChange: (p) => state.changes.push(p),
  };
  return { host, state };
}

describe("TimePlayer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("steps forward one entry per frame", () => {
    const { host, state } = fakeHost(10, 2);
    const player = new TimePlayer(host, { frameMs: 200 });
    player.play();
    expect(player.playing).toBe(true);
    vi.advanceTimersByTime(200);
    expect(state.index).toBe(3);
    vi.advanceTimersByTime(600);
    expect(state.index).toBe(6);
  });

  it("stops on the newest entry instead of looping", () => {
    const { host, state } = fakeHost(4, 1);
    const player = new TimePlayer(host, { frameMs: 100 });
    player.play();
    vi.advanceTimersByTime(1000);
    expect(state.index).toBe(3);
    expect(player.playing).toBe(false);
    expect(state.changes).toEqual([true, false]);
  });

  it("plays from the first entry when started at the end", () => {
    const { host, state } = fakeHost(5, 4);
    const player = new TimePlayer(host, { frameMs: 100 });
    player.play();
    expect(state.index).toBe(0);
    vi.advanceTimersByTime(100);
    expect(state.index).toBe(1);
  });

  it("holds on an entry until its image is on screen", () => {
    const { host, state } = fakeHost(10, 0);
    state.loaded.delete(1);
    const player = new TimePlayer(host, { frameMs: 200, pollMs: 50 });
    player.play();
    vi.advanceTimersByTime(200); // asks for 1, which has not arrived
    expect(state.index).toBe(1);
    vi.advanceTimersByTime(2000); // still loading: the playhead waits
    expect(state.index).toBe(1);
    expect(player.playing).toBe(true);

    state.loaded.add(1);
    // Once it lands it gets a full frame on screen, not a flash.
    vi.advanceTimersByTime(50 + 150);
    expect(state.index).toBe(1);
    vi.advanceTimersByTime(100);
    expect(state.index).toBe(2);
  });

  it("pauses and resumes where it stopped", () => {
    const { host, state } = fakeHost(10, 0);
    const player = new TimePlayer(host, { frameMs: 100 });
    player.play();
    vi.advanceTimersByTime(300);
    player.pause();
    const at = state.index;
    vi.advanceTimersByTime(1000);
    expect(state.index).toBe(at);
    player.toggle();
    vi.advanceTimersByTime(100);
    expect(state.index).toBe(at + 1);
  });

  it("stops once its host is gone", () => {
    const { host, state } = fakeHost(10, 0);
    const player = new TimePlayer(host, { frameMs: 100 });
    player.play();
    vi.advanceTimersByTime(100);
    state.alive = false;
    vi.advanceTimersByTime(500);
    expect(player.playing).toBe(false);
    expect(state.index).toBe(1);
  });

  it("does nothing on a record with a single entry", () => {
    const { host, state } = fakeHost(1, 0);
    const player = new TimePlayer(host);
    player.play();
    expect(player.playing).toBe(false);
    expect(state.changes).toEqual([]);
  });
});
