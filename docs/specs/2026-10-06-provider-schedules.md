# Provider schedules: DeepSeek and MiMo

Date: 2026-10-06
Status: approved (design agreed in conversation; wording and placement decisions recorded below)

## Problem

The tracker shipped with one hardcoded schedule: DeepSeek's peak/off-peak API
pricing. Xiaomi MiMo's Token Plan has its own time-based discount, and a user may
work with either — or both — in the same Harness install. The panel must be about
whatever the session is actually paying with, without becoming a configuration
exercise.

## The two schedules

| | DeepSeek (official API) | MiMo (Token Plan) |
|---|---|---|
| Discounted period | everything except Mon–Fri 01:00–04:00 and 06:00–10:00 UTC; Chinese public holidays count as discounted | **daily** 16:00–24:00 UTC (Beijing 00:00–08:00) |
| Full-rate period | Mon–Fri 01:00–04:00, 06:00–10:00 UTC | daily 00:00–16:00 UTC |
| Weekday logic | yes (Mon–Fri) | none |
| Holiday logic | yes (CN public holidays) | none |
| Discount | half price | 0.8× credits |
| State wording | `OFF-PEAK` / `PEAK` | `NIGHT DISCOUNT` / `FULL RATE` |
| Caveat | applies to the official DeepSeek API | applies to the MiMo Token Plan |

Sources: [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing),
[MiMo Token Plan FAQ](https://mimo.mi.com/docs/en-US/quick-start/faq/token-plan/Plans&Pricing),
[MiMo pay-as-you-go pricing](https://mimo.mi.com/docs/en-US/price/pay-as-you-go)
(the night rate is a Token Plan feature; pay-as-you-go has no time-based discount).

## Design

**Providers are data.** A `PROVIDERS` registry entry carries: id, display label,
a matcher over `(providerId, modelId)`, full-rate windows in UTC minutes, the
weekdays that carry them, holiday dates, the two state labels, the countdown
wording, and the two text lines the expanded panel shows. Internal segment logic
keeps working on "full-rate" windows, so DeepSeek's rule is expressed exactly as
before and MiMo is `[[0, 960]]` every day.

**Switching is automatic, with a manual override.** The active provider is
`override ?? detected ?? "deepseek"`:

- *detected*: the session in view exposes
  `binding.session.projections.faceOf("modelSelection")` → `{ provider, model }`.
  The active session id comes from the `uiSession` service
  (`adapter.current`). Detection is best-effort: every accessor is optional,
  wrapped in try/catch, and re-read on the shared one-second tick.
- *override*: a three-way chip row in the expanded panel (`Follow session`,
  `DeepSeek`, `MiMo`), persisted like the placement preference.
- *fallback*: DeepSeek, so a fresh session with nothing selected still shows a
  meaningful schedule rather than an empty panel.

**Presentation.** The collapsed panel is unchanged and carries no provider name —
the two providers are distinguishable by their own state wording (`NIGHT
DISCOUNT` reads as MiMo, `OFF-PEAK` as DeepSeek). The provider name, its caveat,
and the override chips appear only in the **expanded** panel, which is the
sidebar's click-to-expand view.

An unrecognised provider shows its label with a `NO TIMED DISCOUNT` state and no
countdown, rather than a countdown that would be wrong.

## Non-goals

- Detecting the *plan* (Token Plan vs pay-as-you-go, official vs reseller). The
  caveat lines carry that; the registry shape leaves room to add a per-provider
  plan setting later.
- Per-provider placement or per-provider prefs beyond the override.
- Shipping schedules for resellers that publish their own windows.

## Testing

- MiMo boundaries: 15:59/16:00 and 23:59/24:00 UTC, weekends included.
- DeepSeek cases unchanged (byte-identical expectations).
- Provider matching: `deepseek`, `mimo`/`xiaomi` in provider or model id, unknown.
- Detection fallback: no `uiSession`, no binding, projection absent → default.
- Override wins over detection; override persists; unknown provider → `NO TIMED
  DISCOUNT` with no countdown.
- Both caveat strings render in the expanded panel.
- The 25-zone matrix covers both providers.
