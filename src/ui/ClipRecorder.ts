import {
  clipFilename,
  clipLayout,
  clipSize,
  coverCrop,
  pickClipMime,
  type ClipLayout,
  type ClipSize,
} from "../lib/clipFrame";
// Deliberately no import of the app's data modules (lib/legend, lib/timeline):
// a lazy chunk that reaches into them moves rolldown's shared-chunk grouping,
// and once pulled 24 probe modules into the entry chunk (60 -> 76 kB). The
// app hands this chunk the few values it needs instead (ClipContext).

interface YearMonth {
  year: number;
  month: number;
}

/**
 * Records a time-lapse as a video file: the globe as it plays, with what a
 * viewer needs to read it once it has left the app — what they are looking at,
 * the month, the colour scale with its values, where the data comes from, and
 * where to find the rest.
 *
 * Loaded only when a clip is asked for, so the entry chunk carries none of it.
 *
 * Each frame is composed right after the globe renders (the host's frame
 * hook): the WebGL drawing buffer is only readable in the task that drew it,
 * the same constraint the PNG export works under. The composite canvas is
 * streamed to a MediaRecorder. The clip records one playback, from a short
 * hold on its first frame to a hold on its last: when the playback stops, at
 * its end or because the reader paused it, the clip ends and is saved.
 */

export interface ClipCaption {
  title: string;
  subtitle: string;
  month: string;
  legend?: {
    measures: string;
    stops: { color: string; at: number }[];
    ticks: { min: string; mid: string; max: string } | null;
  };
  /** Where the data comes from, short enough for one line. */
  cite: string;
}

export interface ClipHost {
  /** The globe's canvas. */
  source: HTMLCanvasElement;
  /** Run `draw` after each globe frame renders; returns its removal. */
  onFrame(draw: () => void): () => void;
  /** The caption for the frame being drawn (the month moves). */
  caption(): ClipCaption;
  /** Text and scrim colours for the page's theme. */
  theme(): { fg: string; muted: string; scrim: string; bg: string };
  /** Start the playback the clip records. */
  play(): void;
  isPlaying(): boolean;
  /** Resolves once a playback that started after this call has stopped. */
  playbackEnded(): Promise<void>;
}

/** What a clip is of: its caption, its file name, and how to play it. */
export interface ClipSubject {
  title: string;
  /** Under the title; the layer's measure when not given (lib/legend.ts). */
  subtitle?: string;
  /** The file name's subject: a story id, or the layer id. */
  slug: string;
  play: () => void;
}

/** What the app lends a recording (main.ts); the rest is decided here. */
export interface ClipContext {
  source: HTMLCanvasElement;
  onFrame(draw: () => void): () => void;
  /** The layer's id (the file name's fallback subject) and caption parts. */
  layerId: string;
  measures: string;
  legend?: ClipCaption["legend"];
  cite: string;
  month(): YearMonth;
  /** The month as the dock shows it ("Jun 2023", or "2024" for annual). */
  monthLabel(): string;
  isPlaying(): boolean;
  playbackEnded(): Promise<void>;
  announce(message: string): void;
  toast(message: string): void;
  version: string;
}

/**
 * Record a playback and download it. Everything a clip needs beyond the frames
 * (the caption, the citation, the theme, the file name, what to say when it
 * cannot) lives here, in the lazily-loaded chunk, so the entry chunk carries
 * only the hook and the signal it lends.
 */
export async function saveClip(
  app: ClipContext,
  subject: ClipSubject
): Promise<void> {
  app.announce(`Recording a video of ${subject.title}`);
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.getAttribute("data-theme") !== "light";
  const theme = {
    fg: root.getPropertyValue("--fg").trim() || "#e8eef7",
    muted: root.getPropertyValue("--muted").trim() || "#8b97ab",
    bg: root.getPropertyValue("--bg").trim() || "#05070d",
    scrim: dark ? "rgba(5, 7, 13, 0.72)" : "rgba(234, 240, 248, 0.78)",
  };
  const base = {
    title: subject.title,
    subtitle: subject.subtitle ?? app.measures,
    legend: app.legend,
    cite: app.cite,
  };
  let from: YearMonth | undefined;
  try {
    const { blob, ext } = await recordClip({
      source: app.source,
      onFrame: app.onFrame,
      caption: () => ({ ...base, month: app.monthLabel() }),
      theme: () => theme,
      play: subject.play,
      isPlaying: () => {
        const playing = app.isPlaying();
        if (playing) from ??= app.month();
        return playing;
      },
      playbackEnded: app.playbackEnded,
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = clipFilename(
      subject.slug,
      from ?? app.month(),
      app.month(),
      app.version,
      ext
    );
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    app.announce("Video saved");
  } catch (err) {
    app.toast(
      err instanceof ClipUnsupportedError
        ? "This browser can't record video. Try a current Chrome, Edge, Firefox or Safari."
        : err instanceof ClipNothingToPlayError
          ? "There are no months to play here, so there is nothing to record."
          : "Couldn't record the video. Try again."
    );
  }
}

export class ClipUnsupportedError extends Error {}
export class ClipNothingToPlayError extends Error {}

export interface ClipResult {
  blob: Blob;
  ext: "mp4" | "webm";
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function recordClip(
  host: ClipHost,
  { holdStartMs = 800, holdEndMs = 1600 } = {}
): Promise<ClipResult> {
  const choice =
    typeof MediaRecorder === "undefined"
      ? null
      : pickClipMime((mime) => MediaRecorder.isTypeSupported(mime));
  if (
    !choice ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    throw new ClipUnsupportedError();
  }

  // The caption is set in the app's own faces; make sure they are loaded
  // before the first frame, or it would be drawn in a fallback.
  await Promise.all([
    document.fonts?.load('600 34px "Geist Variable"'),
    document.fonts?.load('500 56px "Geist Mono Variable"'),
  ]).catch(() => undefined);

  const size = clipSize(window.innerWidth, window.innerHeight);
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new ClipUnsupportedError();
  const layout = clipLayout(size);
  const draw = () =>
    paintFrame(ctx, host.source, size, layout, host.caption(), host.theme());

  draw();
  const unhook = host.onFrame(draw);
  const stream = out.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: choice.mime,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data.size) chunks.push(e.data);
  });
  const stopped = new Promise<void>((resolve) =>
    recorder.addEventListener("stop", () => resolve(), { once: true })
  );

  recorder.start(250);
  try {
    await wait(holdStartMs);
    const ended = host.playbackEnded();
    host.play();
    // A story starts its playback once the camera has arrived (~1.5 s); a
    // layer with nothing to play (a static one) never starts at all.
    const started = await waitFor(() => host.isPlaying(), 5000);
    if (!started) throw new ClipNothingToPlayError();
    await ended;
    await wait(holdEndMs);
  } finally {
    recorder.stop();
    await stopped;
    unhook();
    for (const track of stream.getTracks()) track.stop();
  }
  return {
    blob: new Blob(chunks, { type: choice.mime.split(";")[0] }),
    ext: choice.ext,
  };
}

async function waitFor(test: () => boolean, ms: number): Promise<boolean> {
  const until = performance.now() + ms;
  while (!test()) {
    if (performance.now() > until) return false;
    await wait(100);
  }
  return true;
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  size: ClipSize,
  l: ClipLayout,
  cap: ClipCaption,
  theme: { fg: string; muted: string; scrim: string; bg: string }
): void {
  const { width: W, height: H } = size;
  const u = l.unit;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const crop = coverCrop(source.width, source.height, size);
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);

  // Scrims under the text at the top and bottom, so it reads over any
  // imagery; the middle, where the globe is, stays untouched.
  const topH = l.month.y + 40 * u;
  const top = ctx.createLinearGradient(0, 0, 0, topH);
  top.addColorStop(0, theme.scrim);
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, topH);
  const botY = l.legend.y - 70 * u;
  const bot = ctx.createLinearGradient(0, botY, 0, H);
  bot.addColorStop(0, "rgba(0,0,0,0)");
  bot.addColorStop(1, theme.scrim);
  ctx.fillStyle = bot;
  ctx.fillRect(0, botY, W, H - botY);

  const sans = '"Geist Variable", system-ui, sans-serif';
  const mono = '"Geist Mono Variable", ui-monospace, monospace';
  ctx.textBaseline = "alphabetic";

  // Title and subtitle, top left.
  ctx.textAlign = "left";
  const titleRoom =
    l.month.align === "right" ? W - 2 * l.margin - 260 * u : W - 2 * l.margin;
  ctx.fillStyle = theme.fg;
  ctx.font = `600 ${l.title.size}px ${sans}`;
  ctx.fillText(fit(ctx, cap.title, titleRoom), l.title.x, l.title.y);
  ctx.fillStyle = theme.muted;
  ctx.font = `400 ${l.title.subtitleSize}px ${sans}`;
  ctx.fillText(
    fit(ctx, cap.subtitle, titleRoom),
    l.title.x,
    l.title.y + l.title.subtitleSize * 1.6
  );

  // The month.
  ctx.textAlign = l.month.align;
  ctx.fillStyle = theme.fg;
  ctx.font = `500 ${l.month.size}px ${mono}`;
  ctx.fillText(cap.month, l.month.x, l.month.y);

  // The colour scale, bottom left: what it measures, the bar, the values.
  if (cap.legend) {
    const { x, y, width, height } = l.legend;
    ctx.textAlign = "left";
    ctx.fillStyle = theme.muted;
    ctx.font = `400 ${Math.round(14 * u)}px ${sans}`;
    ctx.fillText(fit(ctx, cap.legend.measures, width * 1.6), x, y - 10 * u);
    const bar = ctx.createLinearGradient(x, 0, x + width, 0);
    for (const stop of cap.legend.stops) bar.addColorStop(stop.at, stop.color);
    ctx.fillStyle = bar;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();
    const ticks = cap.legend.ticks;
    if (ticks) {
      ctx.fillStyle = theme.fg;
      ctx.font = `400 ${Math.round(13 * u)}px ${mono}`;
      const ty = y + height + 18 * u;
      ctx.textAlign = "left";
      ctx.fillText(ticks.min, x, ty);
      ctx.textAlign = "center";
      ctx.fillText(ticks.mid, x + width / 2, ty);
      ctx.textAlign = "right";
      ctx.fillText(ticks.max, x + width, ty);
    }
  }

  // The watermark and the citation, bottom right.
  ctx.textAlign = "right";
  ctx.fillStyle = theme.fg;
  ctx.font = `600 ${l.credit.size}px ${sans}`;
  ctx.fillText("roamingeye.org", l.credit.x, l.credit.y);
  ctx.fillStyle = theme.muted;
  ctx.font = `400 ${l.cite.size}px ${mono}`;
  ctx.textAlign = l.cite.align;
  ctx.fillText(fit(ctx, cap.cite, l.cite.room), l.cite.x, l.cite.y);
}

/** The text, shortened with an ellipsis until it fits `room` pixels. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  room: number
): string {
  if (ctx.measureText(text).width <= room) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > room) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}
