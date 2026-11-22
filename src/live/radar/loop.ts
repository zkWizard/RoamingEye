/**
 * Playhead for the radar loop. It only moves a frame index. The monthly
 * timeline is a different control and this module does not know it exists.
 */

export interface RadarPlay {
  index: number;
  playing: boolean;
}

export function startRadarPlay(frameCount: number): RadarPlay {
  return { index: Math.max(0, frameCount - 1), playing: frameCount > 1 };
}

export function toggleRadarPlay(play: RadarPlay): RadarPlay {
  return { ...play, playing: !play.playing };
}

export function stepRadarPlay(play: RadarPlay, frameCount: number): RadarPlay {
  if (!play.playing || frameCount <= 1) return play;
  return { ...play, index: (play.index + 1) % frameCount };
}
