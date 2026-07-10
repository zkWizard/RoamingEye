/** Inline SVG icons (currentColor-aware) for the toolbar and search UI. */

const wrap = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  graticule: wrap(
    `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.6 6.5c3.5 2.2 9.3 2.2 12.8 0M5.6 17.5c3.5-2.2 9.3-2.2 12.8 0"/>`
  ),
  borders: wrap(
    `<circle cx="12" cy="12" r="9"/><path d="M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/><path d="M3.5 9h17M3.5 15h17"/>`
  ),
  cities: wrap(
    `<path d="M3 21h18"/><path d="M5 21V8l5-3v16"/><path d="M10 21V11l6-2v12"/><path d="M16 21V9l3 1.5V21"/><path d="M7.5 9.5v0M7.5 12.5v0M13 13v0M13 16v0"/>`
  ),
  atmosphere: wrap(
    `<circle cx="12" cy="12" r="6"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>`
  ),
  quakes: wrap(
    `<path d="M2 12h4l2-5 3 10 3-8 2 4.5L17.5 12H22"/><circle cx="12" cy="12" r="10"/>`
  ),
  plates: wrap(
    `<circle cx="12" cy="12" r="9"/><path d="M3.6 9.5 8 11l3-4 2.5 6 3.5-2 3.4 1.5"/><path d="M8 11l-1.5 9M13.5 13 12 20.8"/>`
  ),
  volcanoes: wrap(
    `<path d="M9.5 9 4 20h16L14.5 9"/><path d="M9.5 9c1 .9 2-.9 2.5 0s1.7.9 2.5 0"/><path d="M12 5.5v0M9 3.5v0M15 3.5v0"/>`
  ),
  hd: wrap(
    `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 9.5v5M11 9.5v5M7.5 12H11"/><path d="M14 9.5v5h1.8a2.5 2.5 0 0 0 0-5H14Z"/>`
  ),
  search: wrap(`<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`),
  chevronLeft: wrap(`<path d="m14.5 6-6 6 6 6"/>`),
  chevronRight: wrap(`<path d="m9.5 6 6 6-6 6"/>`),
  close: wrap(`<path d="M18 6 6 18M6 6l12 12"/>`),
  pin: wrap(
    `<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>`
  ),
  draw: wrap(
    `<path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16"/><path d="M11 4h2M11 20h2M4 11v2M20 11v2"/>`
  ),
} as const;
