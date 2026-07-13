# Geospatial sampling coverage — 2026-07-13

## Contribution

- Added rendered source-image dimensions to `ProbeSampler` results.
- Passed current-month area-weighted valid fraction and image provenance into place insights.
- Place-insight details now label regional means as approximate and retain coverage plus rendered-image dimensions.

## Validation

- `npm test -- --run src/lib/placeInsights.test.ts` — 6 passed
- `npm run typecheck`
- Focused ESLint and Prettier checks
- `git diff --check`

## Limitations

Image dimensions identify the rendered GIBS sampling input; they are not a ground-resolution measurement or uncertainty estimate. Coverage is supplied sampling coverage only and does not support condition, causal, risk, diagnostic, or forecast claims.
