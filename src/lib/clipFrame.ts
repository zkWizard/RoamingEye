/**
 * The geometry and naming of a recorded time-lapse clip (ui/ClipRecorder.ts):
 * pure, so the layout rules are tested without a canvas.
 *
 * A clip is made to be posted, so its shape follows where it will be seen: a
 * landscape viewport records 16:9 (1280x720) for a feed or a slide, and a
 * portrait one records 9:16 (720x1280), the shape of Shorts, Reels and TikTok,
 * which is where a phone's recording is going. The globe is cropped to fill
 * the frame (cover, centred), since the globe sits in the middle of the view
 * and letterbox bars would waste the frame on nothing.
 */

export interface ClipSize {
  width: number;
  height: number;
}

/** 16:9 from a landscape (or square) view, 9:16 from a portrait one. */
export function clipSize(viewWidth: number, viewHeight: number): ClipSize {
  return viewHeight > viewWidth
    ? { width: 720, height: 1280 }
    : { width: 1280, height: 720 };
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The part of the source canvas that fills the clip: the largest centred
 * rectangle with the clip's aspect, in source pixels.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  clip: ClipSize
): CropRect {
  const target = clip.width / clip.height;
  const source = sourceWidth / sourceHeight;
  if (source > target) {
    const sw = sourceHeight * target;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  const sh = sourceWidth / target;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

/**
 * Where each part of the caption goes. Everything scales with the clip's
 * short side, so a portrait clip carries the same type sizes as a landscape
 * one; `margin` keeps text clear of the edges platforms crop into.
 */
export interface ClipLayout {
  unit: number;
  margin: number;
  /** Title and subtitle, top left. */
  title: { x: number; y: number; size: number; subtitleSize: number };
  /** The month, large, where a viewer's eye goes after the globe. */
  month: { x: number; y: number; size: number; align: "left" | "right" };
  /** The colour bar, bottom left, with its ticks under it. */
  legend: { x: number; y: number; width: number; height: number };
  /** The watermark, bottom right. */
  credit: { x: number; y: number; size: number };
  /**
   * The data citation. A DOI cut short cannot be cited, so it gets the room
   * the frame has: under the watermark in landscape, and its own full-width
   * line along the bottom in portrait, where the colour scale takes the left.
   */
  cite: {
    x: number;
    y: number;
    size: number;
    align: "left" | "right";
    room: number;
  };
}

export function clipLayout(size: ClipSize): ClipLayout {
  const unit = Math.min(size.width, size.height) / 720;
  const margin = Math.round(40 * unit);
  const portrait = size.height > size.width;
  const bottom = size.height - margin;
  return {
    unit,
    margin,
    title: {
      x: margin,
      y: margin + Math.round(34 * unit),
      size: Math.round(34 * unit),
      subtitleSize: Math.round(19 * unit),
    },
    // Landscape: top right, balancing the title. Portrait: under the title,
    // where a tall frame has room and a right-aligned month would crowd it.
    month: portrait
      ? {
          x: margin,
          y: margin + Math.round(150 * unit),
          size: Math.round(64 * unit),
          align: "left",
        }
      : {
          x: size.width - margin,
          y: margin + Math.round(48 * unit),
          size: Math.round(56 * unit),
          align: "right",
        },
    legend: {
      x: margin,
      y: bottom - Math.round((portrait ? 80 : 44) * unit),
      width: Math.round(280 * unit),
      height: Math.round(10 * unit),
    },
    credit: {
      x: size.width - margin,
      y: bottom - Math.round((portrait ? 62 : 26) * unit),
      size: Math.round(22 * unit),
    },
    cite: portrait
      ? {
          x: margin,
          y: bottom,
          size: Math.round(13 * unit),
          align: "left",
          room: size.width - 2 * margin,
        }
      : {
          x: size.width - margin,
          y: bottom,
          size: Math.round(13 * unit),
          align: "right",
          room: size.width - 2 * margin - Math.round(320 * unit),
        },
  };
}

/**
 * The first container format this browser can record, preferring MP4: it is
 * what X, Instagram and most slide software accept, and WebM, the only thing
 * older Chromes record, is refused by several of them.
 */
export const CLIP_MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function pickClipMime(
  isSupported: (mime: string) => boolean
): { mime: string; ext: "mp4" | "webm" } | null {
  for (const mime of CLIP_MIME_CANDIDATES) {
    if (isSupported(mime)) {
      return { mime, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
    }
  }
  return null;
}

const stamp = (ym: { year: number; month: number }): string =>
  `${ym.year}-${String(ym.month).padStart(2, "0")}`;

/**
 * `roamingeye_<story or layer>_<from>_<to>_v<version>.<ext>`: the same shape
 * as the PNG export's name, so a clip in a slide deck stays traceable to what
 * rendered it.
 */
export function clipFilename(
  subject: string,
  from: { year: number; month: number },
  to: { year: number; month: number },
  version: string,
  ext: "mp4" | "webm"
): string {
  return `roamingeye_${subject}_${stamp(from)}_${stamp(to)}_v${version}.${ext}`;
}
