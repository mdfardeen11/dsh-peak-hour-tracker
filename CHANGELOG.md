# Changelog

All notable changes to this plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
