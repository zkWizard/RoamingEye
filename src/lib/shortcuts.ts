/**
 * Keyboard & mouse controls, as pure data for the help overlay (press ?).
 *
 * Keep this list matching reality: the timeline bindings live in
 * ui/TimeSlider.ts, Escape handling in the individual panels, and the globe
 * gestures in main.ts / OrbitControls (see shortcuts.test.ts).
 */

export interface Shortcut {
  /** Key caps (or gesture names) to render as chips, e.g. ["←", "→"]. */
  keys: string[];
  /** What pressing them does, in plain words. */
  does: string;
}

export interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Timeline — click the ruler to focus it first",
    items: [
      { keys: ["←", "→"], does: "Step a month back / forward (also ↓ / ↑)" },
      { keys: ["PgDn", "PgUp"], does: "Jump a year back / forward" },
      { keys: ["Home", "End"], does: "Jump to the oldest / newest month" },
    ],
  },
  {
    title: "Globe — Tab to it first, or click it",
    items: [
      { keys: ["Drag"], does: "Rotate the globe (also ← → ↑ ↓)" },
      { keys: ["Scroll", "Pinch"], does: "Zoom in and out (also + / −)" },
      {
        keys: ["Click", "Enter"],
        does: "Probe a point — chart its full record. Enter takes the point in the middle of the view",
      },
      {
        keys: ["Hover"],
        does: "Read coordinates, country, and marker details",
      },
    ],
  },
  {
    title: "Draw region — press the Draw region button first",
    items: [
      {
        keys: ["Drag", "Enter"],
        does: "Sweep a study region. By key: Enter takes a corner, arrows turn to the opposite one, Enter again charts it",
      },
      { keys: ["Esc"], does: "Leave draw mode without charting anything" },
    ],
  },
  {
    title: "General",
    items: [
      { keys: ["?"], does: "Open this overlay" },
      { keys: ["Esc"], does: "Close open panels, pickers, and this overlay" },
    ],
  },
];
