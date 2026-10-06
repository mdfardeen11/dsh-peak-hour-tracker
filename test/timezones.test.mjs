/**
 * Zone-independence test for dsh-peak-hour-tracker.
 *
 * This suite is designed to be run once per time zone (see
 * `test/run-timezones.mjs`, which does exactly that across twenty zones). It
 * asserts three different kinds of fact:
 *
 *   1. Zone-independent facts — the pricing state, the countdown, and the China
 *      clock — are pinned to exact strings. If the implementation ever started
 *      depending on the viewer's zone, these fail in at least one zone.
 *   2. Zone-dependent facts — the local clock and the local day's peak ranges —
 *      are checked against the ambient zone's own `Intl` output, so the widget
 *      is proved to follow whatever zone the user is actually in.
 *   3. Daylight-saving days are included, so the local-day scan is proved to
 *      survive a 23- or 25-hour local day.
 *
 * Run directly, or through `node test/run-timezones.mjs`.
 *
 *   node test/timezones.test.mjs
 */

import assert from "node:assert/strict";
import { loadPlugin } from "./harness.mjs";

const app = await loadPlugin();
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const offset = -new Date().getTimezoneOffset();
const offsetLabel = `${offset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;

//#region helpers
/** Local 24-hour clock with seconds, in whatever zone this process runs. */
const localClock = new Intl.DateTimeFormat(undefined, { hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** Local 24-hour clock without seconds. */
const localShort = new Intl.DateTimeFormat(undefined, { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
/** Beijing 24-hour clock with seconds. */
const chinaClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * The pricing state at an instant, derived only from UTC — the published rule,
 * written independently of the implementation.
 * @param ms - epoch milliseconds.
 * @returns "peak" or "off".
 */
function referenceState(ms) {
	const d = new Date(ms);
	const weekday = d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
	const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
	const inWindow = (minutes >= 60 && minutes < 240) || (minutes >= 360 && minutes < 600);
	return weekday && inWindow ? "peak" : "off";
}

/**
 * Peak ranges of the ambient local day, scanned minute by minute with the
 * reference rule — the oracle the widget's own scan must agree with.
 * @param ms - epoch milliseconds.
 * @returns formatted "HH:MM–HH:MM" ranges for the local day.
 */
function referenceLocalRanges(ms) {
	const now = new Date(ms);
	const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const ranges = [];
	let open = -1;
	for (let minute = 0; minute < 1440; minute += 1) {
		const peak = referenceState(dayStart + minute * 60000) === "peak";
		if (peak && open === -1) open = minute;
		else if (!peak && open !== -1) {
			ranges.push(`${localShort.format(new Date(dayStart + open * 60000))}–${localShort.format(new Date(dayStart + minute * 60000))}`);
			open = -1;
		}
	}
	if (open !== -1) ranges.push(`${localShort.format(new Date(dayStart + open * 60000))}–${localShort.format(new Date(dayStart + 1440 * 60000))}`);
	return ranges;
}

/**
 * Expand the sidebar panel (idempotently) and read one detail row.
 * @param iso - the UTC instant to freeze the clock at.
 * @param label - the detail row label ("Today" or "Switch").
 * @returns the rendered value text.
 */
function detailValue(iso, label) {
	let view = app.sidebarAt(iso, { wide: true });
	assert.ok(view.find("sidebar-panel"), `${zone} (${offsetLabel}): the sidebar placement renders a panel`);
	if (view.find("details") === undefined) {
		view.find("sidebar-panel").props.onClick();
		view = app.sidebarAt(iso, { wide: true });
	}
	const details = view.find("details");
	assert.ok(details, `${zone} (${offsetLabel}): the sidebar panel expands`);
	const value = details.children
		.filter((child) => child.props.className === "dph-times")
		.find((row) => row.children[0].children[0] === label);
	assert.ok(value, `${zone} (${offsetLabel}): detail row ${label} renders`);
	return value.children[1].children[0];
}
//#endregion

console.log(`  zone ${zone} (UTC${offsetLabel})`);

//#region 1. zone-independent facts
const fixed = [
	{ at: "2026-09-16T02:00:00Z", state: "peak", eta: "→ off-peak in 2h 00m", china: "10:00:00", note: "weekday, first window" },
	{ at: "2026-09-16T05:00:00Z", state: "off", eta: "→ peak in 1h 00m", china: "13:00:00", note: "weekday, between windows" },
	{ at: "2026-09-16T07:30:00Z", state: "peak", eta: "→ off-peak in 2h 30m", china: "15:30:00", note: "weekday, second window" },
	{ at: "2026-09-16T10:30:00Z", state: "off", eta: "→ peak in 14h 30m", china: "18:30:00", note: "weekday, after the last window" },
	{ at: "2026-09-19T16:48:00Z", state: "off", eta: "→ peak in 1d 8h", china: "00:48:00", note: "weekend" },
	{ at: "2026-09-16T06:00:00Z", state: "peak", eta: "→ off-peak in 4h 00m", china: "14:00:00", note: "window boundary" }
];

for (const testCase of fixed) {
	const view = app.overlayAt(testCase.at);
	const panel = view.find("panel");
	assert.equal(panel.props["data-state"], testCase.state, `${zone}: ${testCase.note} state must not depend on the viewer's zone`);
	const text = app.strip(view);
	assert.ok(text.includes(testCase.eta), `${zone}: ${testCase.note} countdown must not depend on the viewer's zone\n  ${text}`);
	assert.ok(text.includes(testCase.china), `${zone}: ${testCase.note} China clock must not depend on the viewer's zone\n  ${text}`);
	assert.ok(text.includes(localClock.format(new Date(testCase.at))), `${zone}: local clock must be this zone's clock\n  ${text}`);
}
console.log(`  ok - state, countdown and China clock identical here; local clock follows ${zone}`);
//#endregion

//#region 2. zone-dependent facts
const instant = "2026-09-16T12:00:00Z";
// The detail rows live in the sidebar placement; the earlier checks are the
// floating one, so switch once here.
app.overlayAt(instant).find("mode-toggle").props.onClick();
const today = detailValue(instant, "Today");
const expected = referenceLocalRanges(Date.parse(instant));
const expectedText = expected.length === 0 ? "no full-rate window" : expected.join(" · ");
assert.equal(today, expectedText, `${zone}: the local day's peak ranges must be this zone's day\n  got      ${today}\n  expected ${expectedText}`);

const switchAt = detailValue(instant, "Switch");
assert.ok(/^\d{2}:\d{2} local · \d{2}:\d{2} UTC$/.test(switchAt), `${zone}: switch instant renders both clocks — got ${switchAt}`);
// 12:00Z on a Wednesday is off-peak, so the next switch is Thursday's first
// window opening — a fixed UTC instant, whatever zone the viewer sits in.
assert.equal(switchAt.split(" · ")[1], "01:00 UTC", `${zone}: the next switch is a fixed UTC instant`);
console.log(`  ok - local day ranges ${today} and switch ${switchAt}`);
//#endregion

//#region 3. daylight-saving days
// DST transitions make the local day 23 or 25 hours long; the local scan must
// still agree with the reference rule, and the UTC facts must not move.
const dstInstants = ["2026-03-08T12:00:00Z", "2026-03-29T12:00:00Z", "2026-10-25T12:00:00Z", "2026-11-01T12:00:00Z"];
for (const iso of dstInstants) {
	const ms = Date.parse(iso);
	const view = app.sidebarAt(iso, { wide: true });
	assert.equal(view.find("sidebar-panel").props["data-state"], referenceState(ms), `${zone}: state across a possible DST shift (${iso})`);
	const rendered = detailValue(iso, "Today");
	const reference = referenceLocalRanges(ms);
	assert.equal(rendered, reference.length === 0 ? "no full-rate window" : reference.join(" · "), `${zone}: local ranges across a possible DST shift (${iso})`);
}
console.log(`  ok - four possible DST-transition days scanned correctly`);
//#endregion

//#region MiMo, pinned through the panel's provider chips
/** The MiMo rule: full rate until 16:00 UTC, night discount from 16:00 to 24:00. */
function mimoFull(ms) {
	const d = new Date(ms);
	return d.getUTCHours() * 60 + d.getUTCMinutes() < 960;
}

/**
 * Full-rate ranges of the ambient local day under the MiMo rule.
 * @param ms - epoch milliseconds.
 * @returns formatted "HH:MM–HH:MM" ranges.
 */
function mimoLocalRanges(ms) {
	const now = new Date(ms);
	const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const ranges = [];
	let open = -1;
	for (let minute = 0; minute < 1440; minute += 1) {
		const full = mimoFull(dayStart + minute * 60000);
		if (full && open === -1) open = minute;
		else if (!full && open !== -1) {
			ranges.push(`${localShort.format(new Date(dayStart + open * 60000))}–${localShort.format(new Date(dayStart + minute * 60000))}`);
			open = -1;
		}
	}
	if (open !== -1) ranges.push(`${localShort.format(new Date(dayStart + open * 60000))}–${localShort.format(new Date(dayStart + 1440 * 60000))}`);
	return ranges;
}

let chipView = app.sidebarAt(instant, { wide: true });
if (chipView.find("details") === undefined) {
	chipView.find("sidebar-panel").props.onClick();
	chipView = app.sidebarAt(instant, { wide: true });
}
chipView.find("provider-mimo").props.onClick();

const mimoToday = detailValue(instant, "Today");
const mimoExpected = mimoLocalRanges(instant).join(" · ");
assert.equal(mimoToday, mimoExpected, `${zone}: the MiMo full-rate ranges must follow this zone's day\n  got      ${mimoToday}\n  expected ${mimoExpected}`);

// Back to the floating panel for the zone-independent MiMo facts.
app.sidebarAt(instant, { wide: true }).find("mode-toggle").props.onClick();
const mimoFixed = [
	{ at: "2026-09-16T00:30:00Z", state: "peak", eta: "→ night discount in 15h 30m" },
	{ at: "2026-09-16T16:00:00Z", state: "off", eta: "→ full rate in 8h 00m" },
	{ at: "2026-09-19T17:00:00Z", state: "off", eta: "→ full rate in 7h 00m" }
];
for (const testCase of mimoFixed) {
	const view = app.overlayAt(testCase.at);
	const text = app.strip(view);
	assert.equal(view.find("panel").props["data-state"], testCase.state, `${zone}: MiMo state at ${testCase.at}`);
	assert.ok(text.includes(testCase.eta), `${zone}: MiMo countdown at ${testCase.at}, expected ${JSON.stringify(testCase.eta)} in\n  ${text}`);
}
console.log(`  ok - MiMo schedule is zone-independent here, with local ranges ${mimoToday}`);
//#endregion

console.log(`  zone ${zone} passed`);
