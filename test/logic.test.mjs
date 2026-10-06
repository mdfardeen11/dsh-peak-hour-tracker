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
assert.ok(capturedCss.includes(".dph-dot{box-sizing:border-box;flex:none;width:8px;height:8px;border-radius:50%;corner-shape:round;background:var(--dph-state"), "the dot is a filled, truly circular dot");
assert.ok(!capturedCss.includes(".dph-dot::after"), "the dot is not built from a stroked ring");
// The harness rounds its circular elements with `corner-shape:round`; without it
// a border-radius circle inherits the app's squircle default and reads as a
// rounded square.
assert.ok(capturedCss.includes("border-radius:50%;corner-shape:round"), "circular elements opt back into a true circle");
assert.ok(/\.dph-rail\{[^}]*border-radius:50%;corner-shape:round/.test(capturedCss), "the rail button opts back into a true circle");
// --dsw-specific-menu is a translucent glass fill (58% light, 45% dark) that the
// harness pairs with a backdrop blur, so the panel must supply its own opaque
// base or the page shows straight through it.
assert.ok(capturedCss.includes("background-color:var(--dsw-alias-bg-layer-1,#fff)"), "the panel paints an opaque surface under the tint");
assert.ok(capturedCss.includes("background-image:linear-gradient(var(--dph-surface,transparent),var(--dph-surface,transparent))"), "the panel keeps the harness menu tint over the opaque base");
assert.ok(!/\.dph-panel\{[^}]*[^-]background:var\(--dph-surface\)/.test(capturedCss), "the panel no longer paints the translucent menu fill alone");
console.log("ok - dot is a filled circle with lighter colour bands, the panel is opaque, and the tokens reach both placements");
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
const classNames = stacked.nodes.map((node) => node.props.className).filter((name) => typeof name === "string");
/** Document order of the first element carrying a given class token. */
const indexOfClass = (token) => classNames.findIndex((name) => name.split(" ").includes(token));
assert.ok(indexOfClass("dph-status") < indexOfClass("dph-times"), "the status group comes first");
assert.ok(indexOfClass("dph-times") < indexOfClass("dph-eta"), "the clocks group comes before the countdown");
const grid = stacked.find("clocks");
assert.ok(grid, "the clocks block renders as its own element");
assert.equal(grid.props.className, "dph-times dph-clocks", "the clocks block is the interactive one");
assert.equal(grid.children.length, 4, "local and China time share one two-row grid");
assert.equal(grid.children[0].children[0], "Local", "first time row is local");
assert.equal(grid.children[2].children[0], "China", "second time row is China");
const eta = stacked.nodes.find((node) => node.props.className === "dph-eta");
assert.equal(eta.children.length, 2, "the countdown separates its label from its value");
assert.equal(eta.children[0].children[0], "→ off-peak in", "the countdown label names the target window");
assert.equal(eta.children[1].props.className, "dph-eta-value", "the countdown value is its own element");
console.log("ok - groups stack vertically as status, local+China, countdown, with labels spaced from their values");
//#endregion

//#region the clocks block toggles 12/24-hour time
/** The 12-hour formatters the panel uses for its toggled view. */
const localClock12 = new Intl.DateTimeFormat("en-US", { hour12: true, hour: "numeric", minute: "2-digit" });
const chinaClock12 = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour12: true, hour: "numeric", minute: "2-digit" });
const clockInstant = new Date("2026-09-16T05:00:00Z");

assert.ok(app.strip(app.overlayAt("2026-09-16T05:00:00Z")).includes(localClock.format(clockInstant)), "24-hour time with seconds is the default");
grid.props.onClick({ stopPropagation: () => {} });
assert.equal(storage.prefs().twelveHour, true, "pressing the clocks block switches to 12-hour time");
const twelve = app.strip(app.overlayAt("2026-09-16T05:00:00Z"));
assert.ok(twelve.includes(localClock12.format(clockInstant)), "the local clock reads in 12-hour form\n  " + twelve);
assert.ok(twelve.includes(chinaClock12.format(clockInstant)), "the China clock reads in 12-hour form\n  " + twelve);
assert.ok(/AM|PM/.test(twelve), "a day period is shown\n  " + twelve);
assert.ok(!twelve.includes(localClock.format(clockInstant)), "seconds are dropped in 12-hour form\n  " + twelve);

// In the sidebar the clocks block must not also expand the panel.
app.overlayAt("2026-09-16T05:00:00Z").find("mode-toggle").props.onClick();
const clockRow = app.sidebarAt("2026-09-16T05:00:00Z", { wide: true });
assert.equal(clockRow.find("details"), undefined, "the sidebar panel starts collapsed");
clockRow.find("clocks").props.onClick({ stopPropagation: () => {} });
const afterClockPress = app.sidebarAt("2026-09-16T05:00:00Z", { wide: true });
assert.equal(afterClockPress.find("details"), undefined, "pressing the clocks does not expand the panel");
assert.equal(storage.prefs().twelveHour, false, "pressing again returns to 24-hour time");
assert.ok(app.strip(afterClockPress).includes(localClock.format(clockInstant)), "24-hour time with seconds is back");
app.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("mode-toggle").props.onClick();
console.log("ok - the clocks block toggles 12-hour time with AM/PM, without expanding the panel");
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

//#region MiMo schedule, chosen through the provider chips
/** Expand the sidebar panel if it is collapsed, and return the expanded view. */
function expandSidebar(iso) {
	let view = app.sidebarAt(iso, { wide: true });
	if (view.find("details") === undefined) {
		view.find("sidebar-panel").props.onClick();
		view = app.sidebarAt(iso, { wide: true });
	}
	return view;
}

app.overlayAt("2026-09-16T05:00:00Z").find("mode-toggle").props.onClick();
const withChips = expandSidebar("2026-09-16T05:00:00Z");
assert.ok(withChips.find("provider-chips"), "the expanded panel offers a schedule choice");
assert.equal(withChips.find("provider").children[0], "DeepSeek", "the default schedule is DeepSeek");
assert.ok(app.strip(withChips).includes("official DeepSeek API"), "the DeepSeek caveat is shown");
withChips.find("provider-mimo").props.onClick();
assert.equal(storage.prefs().override, "mimo", "pinning a schedule persists");
app.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("mode-toggle").props.onClick();

const mimoCases = [
	{ at: "2026-09-16T00:30:00Z", state: "peak", label: "FULL RATE", eta: "→ night discount in 15h 30m" },
	{ at: "2026-09-16T15:59:00Z", state: "peak", label: "FULL RATE", eta: "→ night discount in 1m 00s" },
	{ at: "2026-09-16T16:00:00Z", state: "off", label: "NIGHT DISCOUNT", eta: "→ full rate in 8h 00m" },
	{ at: "2026-09-16T23:59:00Z", state: "off", label: "NIGHT DISCOUNT", eta: "→ full rate in 1m 00s" },
	{ at: "2026-09-19T17:00:00Z", state: "off", label: "NIGHT DISCOUNT", eta: "→ full rate in 7h 00m" }
];
for (const testCase of mimoCases) {
	const view = app.overlayAt(testCase.at);
	const text = app.strip(view);
	assert.equal(view.find("panel").props["data-state"], testCase.state, "MiMo state at " + testCase.at);
	assert.ok(text.includes(testCase.label), "MiMo label at " + testCase.at + " in\n  " + text);
	assert.ok(text.includes(testCase.eta), "MiMo countdown at " + testCase.at + ", expected " + JSON.stringify(testCase.eta) + " in\n  " + text);
}
console.log("ok - MiMo: night discount daily 16:00–24:00 UTC, full rate otherwise, weekends included");

app.overlayAt("2026-09-16T17:00:00Z").find("mode-toggle").props.onClick();
const mimoChips = expandSidebar("2026-09-16T17:00:00Z");
assert.equal(mimoChips.find("provider").children[0], "MiMo", "the expanded panel names the pinned provider");
assert.ok(app.strip(mimoChips).includes("MiMo Token Plan"), "the MiMo caveat is shown");
mimoChips.find("provider-auto").props.onClick();
assert.equal(storage.prefs().override, null, "following the session clears the pin");
assert.equal(expandSidebar("2026-09-16T17:00:00Z").find("provider").children[0], "DeepSeek", "with nothing detected it falls back to the default");
console.log("ok - the provider chips pin, unpin, and persist a schedule");
//#endregion

//#region provider detection
/**
 * A stub `uiSession` + `sessions` pair reporting one model selection.
 * @param provider - the provider id the projection reports.
 * @param model - the model id the projection reports.
 * @returns the service map for `loadPlugin`.
 */
function sessionServices(provider, model) {
	const selection = { provider, model };
	const binding = { session: { projections: { faceOf: (name) => (name === "modelSelection" ? { getSnapshot: () => selection } : undefined) } } };
	return {
		uiSession: { adapter: { current: { getSnapshot: () => ({ value: { key: "session-1" } }) } } },
		sessions: { binding: (id) => (id === "session-1" ? binding : undefined) }
	};
}

const mimoSession = await loadPlugin({ services: sessionServices("xiaomi", "mimo-v2.6-pro") });
assert.ok(mimoSession.strip(mimoSession.overlayAt("2026-09-16T17:00:00Z")).includes("NIGHT DISCOUNT"), "a MiMo session selects the MiMo schedule with no override");
const deepseekSession = await loadPlugin({ services: sessionServices("deepseek", "deepseek-v4-pro") });
assert.ok(deepseekSession.strip(deepseekSession.overlayAt("2026-09-16T05:00:00Z")).includes("PEAK"), "a DeepSeek session selects the DeepSeek schedule");

const unknownSession = await loadPlugin({ services: sessionServices("acme", "acme-1") });
const unknownView = unknownSession.overlayAt("2026-09-16T05:00:00Z");
assert.ok(unknownSession.strip(unknownView).includes("NO TIMED DISCOUNT"), "an unrecognised provider says so instead of showing a countdown");
assert.ok(!unknownSession.strip(unknownView).includes("→"), "an unrecognised provider shows no countdown");
unknownSession.overlayAt("2026-09-16T05:00:00Z").find("mode-toggle").props.onClick();
unknownSession.sidebarAt("2026-09-16T05:00:00Z", { wide: true }).find("sidebar-panel").props.onClick();
const unknownExpanded = unknownSession.sidebarAt("2026-09-16T05:00:00Z", { wide: true });
assert.equal(unknownExpanded.find("provider").children[0], "acme", "the expanded panel names the unknown provider");
assert.ok(unknownSession.strip(unknownExpanded).includes("No published peak/off-peak pricing"), "and explains why there is no countdown");
assert.equal(unknownExpanded.nodes.filter((node) => node.props.className === "dph-times").length, 1, "the expanded panel shows the provider row only, with no switch or day rows");

const resilient = await loadPlugin({
	services: {
		get uiSession() {
			throw new Error("detection blew up");
		}
	}
});
assert.ok(resilient.strip(resilient.overlayAt("2026-09-16T05:00:00Z")).includes("PEAK"), "a throwing service falls back to the default schedule");
console.log("ok - detection follows the session, and never breaks the panel when it cannot");
//#endregion

console.log("\nall peak-hours checks passed");
