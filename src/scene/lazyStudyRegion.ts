import { Group } from "three";
import type { Bounds } from "../lib/imagery";
import type { YearMonth } from "../lib/timeline";
import type { StudyRegion } from "./StudyRegion";

type StudyCallbacks = {
  onLoadingChange?: (loading: boolean) => void;
  onStatus?: (text: string) => void;
};

/**
 * Study-region imagery is off until a region is opened. The shell keeps the
 * same methods main already calls, and the class arrives with the first show.
 */
export function lazyStudyRegion(
  maxAnisotropy: number,
  callbacks: StudyCallbacks
): {
  readonly object: Group;
  readonly active: boolean;
  show(bounds: Bounds, ym: YearMonth): void;
  setMonth(ym: YearMonth): void;
  hide(): void;
} {
  const object = new Group();
  object.visible = false;
  let impl: StudyRegion | undefined;
  let pending: Promise<StudyRegion> | undefined;
  let shown = false;

  function load(): Promise<StudyRegion> {
    pending ??= import("./StudyRegion").then(({ StudyRegion: Region }) => {
      const region = new Region(maxAnisotropy, callbacks);
      region.object.visible = true;
      object.add(region.object);
      impl = region;
      return region;
    });
    return pending;
  }

  return {
    object,
    get active() {
      return shown && (impl?.active ?? object.visible);
    },
    show(bounds, ym) {
      shown = true;
      object.visible = true;
      void load().then((region) => region.show(bounds, ym));
    },
    setMonth(ym) {
      impl?.setMonth(ym);
    },
    hide() {
      shown = false;
      object.visible = false;
      impl?.hide();
    },
  };
}
