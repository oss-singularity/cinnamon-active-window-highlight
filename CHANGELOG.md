# Changelog

## 1.1.1 — 2026-08-23

- Keep the highlight directly above its focused window instead of above every
  application window, so Always-on-top windows correctly cover it.
- Follow Muffin restacking changes while the focused window stays unchanged.

## 1.1.0 — 2026-08-11

- Add a configurable four-sided highlight for all supported window toolkits.
- Default the frame to 1 px.
- Draw one border instead of four edge actors, with configurable top rounding
  and Cinnamon-style square bottom corners.
- Put highlight actors below Cinnamon menus and panels, fixing menu overlap.
- Preserve the Active Window Indicator top-bar design and settings.
