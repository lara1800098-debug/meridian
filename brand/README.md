# Brand assets

Put the **official Concentrix 2026 logo files** here — use only the supplied files; never redraw, recolour, stretch or approximate the logo.

Expected names (the app picks them up automatically, no code change needed):

- `concentrix-logo-light.svg` — for light backgrounds
- `concentrix-logo-dark.svg` — for dark backgrounds
- `favicon.png` (optional, 512×512)

Run `npm run brand:sync` (or just restart the app) to copy them into `public/brand/`.
Until they exist the header shows the text placeholder `[CONCENTRIX LOGO]`.

Colours and fonts: edit `theme/tokens.css` and `theme/tokens.ts` only.
