# thinking-orbs (vendored engine)

The dotted thought-orb animations behind `src/ui/ThinkingOrb.ts`.

- **Upstream:** [`Jakubantalik/Libraries.dev`](https://github.com/Jakubantalik/Libraries.dev), `packages/thinking-orbs/src/`
- **Pinned at:** commit `5e7afad5fc8f3661e0bf0b4cd3f87de482ffcf16`. This is the `thinking-orbs@0.3.2` release on npm.
- **License:** MIT © Jakub Antalik. The notice is in [`LICENSE`](./LICENSE) and ships with the copy, as the license requires.

## Why a copy, not the npm package

The package is a React component. React is a required peer dependency, so npm would install it here too. The engine underneath is framework-free canvas geometry. The package also moved from Vue (0.1) to React (0.3) inside two months, so pinning a copy is safer than tracking its API.

Copying just the engine adds no dependencies, and nothing new goes through the lockfile or the supply-chain gates. It also lets the bundler drop the modes the app never draws.

## What is here

The files are upstream's, byte for byte, except where a line is marked `LOCAL:`.

| File | Upstream path | Local change |
| --- | --- | --- |
| `engine/core.ts` | `src/engine/core.ts` | `paint`'s unused `rMin` parameter renamed `_rMin`, for this repo's `noUnusedParameters` |
| `engine/profiles.ts` | `src/engine/profiles.ts` | none |
| `engine/lattice.ts` | `src/engine/lattice.ts` | none |
| `engine/types.ts` | `src/engine/types.ts` | none |
| `presets.ts` | `src/presets.ts` | none |
| `types.ts` | `src/types.ts` | trimmed to `OrbState` and `OrbSize`; upstream also declares the React props |

Upstream's `registry.ts` is deliberately left out: it imports every mode. `ThinkingOrb.ts` keeps its own map of the modes the app uses, currently `globe` (searching) and `wave` (listening). To add a state, copy its `engine/*.ts` file from the pinned commit and add it to that map.

Prettier skips this directory (`.prettierignore`), so the copy stays diffable against a new release.
