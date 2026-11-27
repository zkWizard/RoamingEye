# Mobile UI preview (390×844)

Screenshots of the compact phone layout at iPhone 14 width.

| File                                | State                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| `before-390x844.png`                | Prior layout (cluttered dock, full attribution, action pill) |
| `after-default-390x844.png`         | Compact timeline bar, collapsed legend sheet, credits line   |
| `after-legend-expanded-390x844.png` | Legend and data details expanded                             |
| `after-menu-open-390x844.png`       | More menu with Draw / Compare / Share                        |

Regenerate after images with the preview server on port 4173:

```bash
npm run build && npm run preview &
node scripts/capture-mobile-ui-preview.mjs
```
