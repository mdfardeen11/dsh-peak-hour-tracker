/**
 * Behavioural test for dsh-peak-hour-tracker.
 *
 * Drives the real components through their own handlers: schedule cases, the
 * three stacked groups, both placements, the state dot, the placement icons, the
 * click-to-expand reveal, drag-and-clamp, and persistence.
 *
 *   node test/logic.test.mjs
 *
 * Beijing clock, pricing state and countdown are asserted as exact strings (they
 * are time-zone independent); local-clock assertions derive from the host zone.
 * `test/run-timezones.mjs` re-runs the zone-sensitive parts across the world.
 */

import assert from "node:assert/strict";
import { loadPlugin, PLUGIN_ID, STORAGE_KEY } from "./harness.mjs";

const app = await loadPlugin();
const { plugin, entries, capturedCss, storage } = app;

//#region registration shape
assert.deepEqual(plugin.inject, ["slots"], "requires the slot registry service");
assert.equal(entries.size, 2, "registers exactly two entries");
assert.ok(entries.has("shell.overlay"), "registers the floating panel in the frame-wide overlay");
assert.ok(entries.has("sidebar.footer.action"), "registers the sidebar entry above Settings");
assert.equal(entries.get("shell.overlay").options.id, "peak-hours", "the overlay entry uses its own cell id");
assert.equal(entries.get("sidebar.footer.action").options.id, "peak-hours", "the sidebar entry uses its own cell id");
assert.equal(entries.get("shell.overlay").component.name, "OverlayRoot", "the overlay component is the documented one");
console.log(`ok - ${PLUGIN_ID} registers two placements and no third mode`);
//#endregion

//#region stylesheet scope
// The sidebar panel and the rail render outside the overlay, so the colour
// tokens must be declared on them as well; the state variable must stay scoped
// to this plugin's own elements.
assert.ok(capturedCss.length > 0, "the bundle injects its stylesheet");
let depth = 0;
for (const character of capturedCss) {
	if (character === "{") depth += 1;
	else if (character === "}") depth -= 1;
	if (depth < 0) break;
}
assert.equal(depth, 0, "stylesheet braces balance");
assert.ok(capturedCss.includes(".dph-overlay,.dph-panel,.dph-rail{--dph-off:"), "colour tokens are declared on the sidebar panel and rail, not only the overlay");
assert.ok(capturedCss.includes(".dph-panel[data-state=off],.dph-rail[data-state=off]"), "the state variable is scoped to this plugin's own elements");
assert.ok(!capturedCss.includes("}[data-state=off]{") && !capturedCss.startsWith("[data-state=off]{"), "no unscoped state rule can leak onto other components");
assert.ok(capturedCss.includes("--dph-band-1:color-mix") && capturedCss.includes("--dph-band-2:color-mix"), "the dot carries two lighter bands derived from the state colour");
assert.ok(capturedCss.includes(".dph-dot{box-sizing:border-box;flex:none;width:8px;height:8px;border-radius:50%;background:var(--dph-state"), "the dot is a filled circle");
assert.ok(!capturedCss.includes(".dph-dot::after"), "the dot is not built from a stroked ring");
console.log("ok - dot is a filled circle with lighter colour bands, and the tokens reach both placements");
//#endregion

//#region the three stacked groups
const localClock = new Intl.DateTimeFormat(undefined, { hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const chinaClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const cases = [
	{ name: "weekday inside the first peak window", at: "2026-09-16T02:00:00Z", state: "peak", eta: "→ off-peak in 2h 00m" },
	{ name: "weekday between the two peak windows", at: "2026-09-16T05:00:00Z", state: "off", eta: "→ peak in 1h 00m" },
	{ name: "weekday inside the second peak window", at: "2026-09-16T07:30:00Z", state: "peak", eta: "→ off-peak in 2h 30m" },
	{ name: "weekday after the last window waits for tomorrow", at: "2026-09-16T10:30:00Z", state: "off", eta: "→ peak in 14h 30m" },
	{ name: "weekend is entirely off-peak, next change is Monday", at: "2026-09-19T16:48:00Z", state: "off", eta: "→ peak in 1d 8h" },
	{ name: "boundary instant belongs to the window starting there", at: "2026-09-16T06:00:00Z", state: "peak", eta: "→ off-peak in 4h 00m" },
	{ name: "Friday last window ends into a full off-peak weekend", at: "2026-09-18T09:30:00Z", state: "peak", eta: "→ off-peak in 30m 00s" }
];

for (const testCase of cases) {
	const instant = new Date(testCase.at);
	const view = app.overlayAt(testCase.at);
	const panel = view.find("panel");
	assert.ok(panel, testCase.name + ": the floating panel renders");
	assert.equal(panel.props["data-state"], testCase.state, testCase.name + ": panel state");
	const text = app.strip(view);
	assert.ok(text.includes(chinaClock.format(instant)), testCase.name + ": China clock " + chinaClock.format(instant) + " in\n  " + text);
	assert.ok(text.includes(localClock.format(instant)), testCase.name + ": local clock " + localClock.format(instant) + " in\n  " + text);
	assert.ok(text.includes(testCase.eta), testCase.name + ": expected " + JSON.stringify(testCase.eta) + " in\n  " + text);
	console.log("ok - " + testCase.name + " -> " + testCase.state + ", " + testCase.eta);
}

const stacked = app.overlayAt("2026-09-16T02:00:00Z");
const classes = stacked.nodes.map((node) => node.props.className).filter((name) => typeof name === "string" && name.startsWith("dph-"));
assert.ok(classes.indexOf("dph-status") < classes.indexOf("dph-times"), "the status group comes first");
assert.ok(classes.indexOf("dph-times") < classes.indexOf("dph-eta"), "the clocks group comes before the countdown");
const grid = stacked.nodes.find((node) => node.props.className === "dph-times");
assert.equal(grid.children.length, 4, "local and China time share one two-row grid");
assert.equal(grid.children[0].children[0], "Local", "first time row is local");
assert.equal(grid.children[2].children[0], "China", "second time row is China");
const eta = stacked.nodes.find((node) => node.props.className === "dph-eta");
assert.equal(eta.children.length, 2, "the countdown separates its label from its value");
assert.equal(eta.children[0].children[0], "→ off-peak in", "the countdown label names the target window");
assert.equal(eta.children[1].props.className, "dph-eta-value", "the countdown value is its own element");
console.log("ok - groups stack vertically as status, local+China, countdown, with labels spaced from their values");
//#endregion

//#region no tooltips, and the floating panel does not expand
const floatPanel = stacked.find("panel");
assert.equal(floatPanel.props.title, undefined, "the floating panel carries no tooltip");
assert.equal(floatPanel.props.role, "group", "the floating panel is not an expand control");
assert.equal(floatPanel.props.onClick, undefined, "the floating panel is drag-only");
assert.equal(floatPanel.props.tabIndex, undefined, "the floating panel is not focusable");
assert.equal(stacked.find("mode-toggle").props.title, undefined, "the placement button carries no tooltip");
assert.equal(stacked.find("details"), undefined, "the floating panel shows no extra details");
assert.ok(stacked.nodes.every((node) => node.props.title === undefined), "nothing in the floating tree has a tooltip");
console.log("ok - no tooltips, and the floating panel stays drag-only");
//#endregion

//#region dragging and persistence
const dragged = app.overlayAt("2026-09-16T05:00:00Z");
const before = storage.prefs().right;
app.gesture(dragged.find("panel"), [600, 400]);
assert.equal(storage.prefs().right, before, "a gesture without movement does not move the panel");
app.gesture(dragged.find("panel"), [600, 400], [-450, -450]);
assert.equal(storage.prefs().right, 1200 - 146 - 10, "drag clamps to the right edge margin");
assert.equal(storage.prefs().bottom, 800 - 96 - 10, "drag clamps to the bottom edge margin");
app.gesture(dragged.find("panel"), [600, 400], [300, 300]);
assert.ok(storage.prefs().right > 0 && storage.prefs().right < 1200, "drag stores an in-viewport right offset");
assert.equal(app.overlayAt("2026-09-16T05:00:00Z").find("float").props.style.right, storage.prefs().right + "px", "the panel renders at the dragged offset");
assert.ok(storage.raw(STORAGE_KEY) !== undefined, "preferences persist under the documented key");
console.log("ok - floating panel drags, clamps inside the viewport, and is remembered");
//#endregion

//#region sidebar placement
app.overlayAt("2026-09-16T05:00:00Z").find("mode-toggle").props.onClick();
assert.equal(storage.prefs().mode, "sidebar", "the toggle persists the sidebar placement");
assert.equal(app.overlayAt("2026-09-16T05:00:00Z").find("panel"), undefined, "the floating panel hides in sidebar placement");

const wide = app.sidebarAt("2026-09-16T05:00:00Z", { wide: true });
const sidebarPanel = wide.find("sidebar-panel");
assert.ok(sidebarPanel, "the sidebar renders a panel");
assert.equal(sidebarPanel.props["data-state"], "off", "the sidebar panel carries the state colour");
assert.equal(sidebarPanel.props.className, "dph-panel dph-panel--wide", "the sidebar panel is the same panel, widened for the column");
assert.ok(wide.find("dot"), "the sidebar panel carries the state dot");
assert.ok(wide.find("popout-icon"), "the sidebar shows the pop-out icon");
assert.ok(wide.nodes.every((node) => node.props.title === undefined), "nothing in the sidebar tree has a tooltip");
assert.equal(sidebarPanel.props["aria-expanded"], false, "the sidebar panel starts collapsed");

const railView = app.sidebarAt("2026-09-16T05:00:00Z", { wide: false });
const rail = railView.find("rail");
assert.ok(rail, "a collapsed sidebar gets the round rail button");
assert.ok(railView.find("dot"), "the collapsed rail shows only the coloured dot");
assert.equal(app.strip(railView), "", "the collapsed rail shows no time or text");
assert.equal(rail.props.title, undefined, "the rail button carries no tooltip");

// Same information, same order, in both placements.
app.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("mode-toggle").props.onClick();
assert.equal(app.strip(wide), app.strip(app.overlayAt("2026-09-16T05:00:00Z")), "both placements render identical content");
console.log("ok - sidebar shows the identical panel, and the rail is the dot alone");
//#endregion

//#region click-to-expand in the sidebar
app.overlayAt("2026-09-16T05:00:00Z").find("mode-toggle").props.onClick();
const collapsed = app.sidebarAt("2026-09-16T05:00:00Z", { wide: true });
assert.equal(collapsed.find("details"), undefined, "the sidebar panel starts without details");
assert.equal(typeof collapsed.find("sidebar-panel").props.onClick, "function", "the sidebar panel is clickable");
collapsed.find("sidebar-panel").props.onClick();
const expanded = app.sidebarAt("2026-09-16T05:00:00Z", { wide: true });
assert.ok(expanded.find("details"), "clicking the sidebar panel reveals the extra rows");
assert.equal(expanded.find("sidebar-panel").props["aria-expanded"], true, "the expanded panel reports its state");
assert.ok(app.strip(expanded).includes("Switch"), "details name the switch instant");
// The switch instant is fixed in UTC, so only its UTC half may be hardcoded;
// the local half must follow whatever zone the host is in.
const switchInstant = new Date("2026-09-16T06:00:00Z");
const localShort = new Intl.DateTimeFormat(undefined, { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
assert.ok(
	app.strip(expanded).includes(localShort.format(switchInstant) + " local · 06:00 UTC"),
	"details give the switch instant in both clocks\n  " + app.strip(expanded)
);
assert.ok(app.strip(expanded).includes("Today"), "details name the day's windows");
assert.ok(app.strip(expanded).includes("off-peak is half price"), "details carry the pricing note");
expanded.find("sidebar-panel").props.onClick();
assert.equal(app.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("details"), undefined, "clicking again collapses the panel");
assert.equal(storage.prefs().expanded, undefined, "the reveal is not persisted");
console.log("ok - clicking the sidebar panel expands it, and clicking again collapses it");
//#endregion

//#region back to floating
app.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("mode-toggle").props.onClick();
assert.equal(storage.prefs().mode, "float", "popping out persists the floating placement");
assert.ok(app.overlayAt("2026-09-16T05:00:00Z").find("panel"), "the floating panel returns");
assert.equal(app.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("sidebar-panel"), undefined, "the sidebar panel hides in floating placement");
console.log("ok - placement round-trips");
//#endregion

console.log("\nall peak-hours checks passed");
