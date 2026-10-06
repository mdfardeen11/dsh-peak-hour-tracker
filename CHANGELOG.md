# Changelog

All notable changes to this plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-10-06

### Fixed

- **The pop-out icon's arrow touched the box.** The box now leaves its top-right
  corner open with the arrow set out beyond it, so the two shapes read as one
  glyph with a clear gap instead of a single connected outline.

### Added

- **Clicking the clocks toggles 12-hour time.** The block showing local and China
  time swaps 24-hour-with-seconds for 12-hour with AM/PM (`4:48 PM`) and back,
  and remembers the choice. Only that block is the target: it stops the press so
  the surrounding sidebar row still expands, collapses, and switches placement
  exactly as before.

## [1.1.0] - 2026-10-06

The tracker is no longer DeepSeek-only.

### Added

- **Xiaomi MiMo Token Plan schedule**: the night discount runs daily
  16:00–24:00 UTC (Beijing 00:00–08:00, coefficient 0.8× credits), with full rate
  the rest of the day. It has no weekday or holiday logic, so it is expressed in
  the same registry as a single full-rate window (00:00–16:00 UTC, every day).
- **Provider registry**: schedules are data — id, label, matcher, full-rate
  windows, weekdays, holidays, both state labels, the countdown wording, and the
  schedule note plus caveat the expanded panel shows. Adding a provider is one
  entry.
- **Automatic provider switching**: the tracked schedule follows the provider id
  of the session in view, read from the harness's `modelSelection` projection
  through the `uiSession` service. Every accessor is optional and guarded, and
  the read re-runs on the shared one-second tick.
- **Manual override**: `Follow session` / `DeepSeek` / `MiMo` chips in the
  expanded panel, persisted like the placement preference.
- **Honest unknown state**: a provider with no published time-based discount
  shows `NO TIMED DISCOUNT` with no countdown, instead of a countdown that would
  be wrong.
- **Route caveats** in the expanded panel: "Off-peak pricing applies to the
  official DeepSeek API." and "The 0.8× night rate applies to the MiMo Token
  Plan." — because a discount belongs to the route you buy through, not to a
  model name.
- Design note at `docs/specs/2026-10-06-provider-schedules.md`.

### Changed

- The expanded panel's day row is now labelled by full-rate windows, and reads
  "no full-rate window" when a day has none.

## [1.0.1] - 2026-10-03

Two visual defects reported from the DeepSeek Harness desktop build, both
diagnosed by reading the shipped stylesheets rather than guessing, and both now
locked by tests.

### Fixed

- **The state dot rendered as a rounded square.** The harness shapes its UI with
  the CSS `corner-shape` property, so `border-radius:50%` on its own inherits the
  app's squircle default. Every circular element the harness ships opts back in
  with `corner-shape:round` (its own 8px status dot does exactly this); the dot
  and the sidebar rail button now do too.
- **The floating panel was see-through.** `--dsw-specific-menu` is a glass fill
  (`#f8f9fa94` light, `#43454a73` dark) that the harness always pairs with a
  backdrop blur, so painting it alone let page text show through. The panel now
  paints an opaque `--dsw-alias-bg-layer-1` base and layers the menu tint over
  it, keeping the menu tone while being fully opaque.

### Added

- README section documenting both harness quirks for future maintainers.

## [1.0.0] - 2026-09-19

First public release.

### Added

- **Peak / off-peak state** for DeepSeek API pricing, computed in UTC from the
  published rule (peak 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday; every
  other hour off-peak, weekends and Chinese public holidays included).
- **One panel, three stacked groups**: the pricing state, local and China
  (Beijing) time, and a live countdown to the next window.
- **Two placements**, switchable from the panel and remembered:
  - *Floating* — a draggable panel, clamped to the viewport, position persisted.
  - *Sidebar* — the same panel as a row in the sidebar foot directly above
    Settings (`sidebar.footer.action`), widened to the column; the collapsed
    rail keeps the coloured state dot.
- **Click-to-expand details** in the sidebar: the next switch instant in local
  and UTC time, the local day's peak windows, and the pricing note. Nothing is
  revealed on hover, and no surface carries a tooltip.
- **Harness-native styling** read from the live theme tokens
  (`--dsw-alias-state-business-primary` and `--dsw-alias-state-warn-primary` for
  the state, `--dsw-specific-menu`, `--dsw-alias-border-l1/l2`,
  `--dsw-elevation-prominent`, the mono and tabular-figure tokens).
- **State mark**: a filled dot circled by two lighter bands of the same colour.
- **Worldwide support**: the schedule is computed in UTC, the local clock
  follows whatever zone the viewer is in, and the local-day scan survives
  daylight-saving transitions. Verified across 25 zones from UTC-11 to UTC+14.
- **Cross-platform installers** (`install.ps1`, `install.sh`, and matching
  uninstallers) for profiles without pnpm, plus the standard
  `dsh plugin --profile web add` route through `cordis.patch.yml`.
- **Tests**: 15 behavioural checks plus a 25-zone timezone matrix, both runnable
  with plain `node`, and wired into GitHub Actions.
- **No network access and no telemetry**: the plugin reads no remote data and
  writes only its own `localStorage` key.
