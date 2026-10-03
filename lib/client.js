/**
 * Peak/off-peak hours tracker — browser half.
 *
 * One panel component, two placements, identical in both:
 *
 *   ● OFF-PEAK              ← 1. pricing state (filled dot, banded in the state colour)
 *   LOCAL      16:48:12     ← 2. local and China time, stacked
 *   CHINA      00:48:12
 *   → peak in      1d 8h    ← 3. countdown to the next window
 *
 * Float: the panel in the corner, draggable, position remembered. Sidebar: the
 * same panel as a row in the sidebar foot, directly above Settings; collapsed,
 * the rail keeps only the coloured dot. Clicking the sidebar panel expands it
 * with the switch instant and the day's windows; nothing is revealed on hover,
 * and no surface carries a tooltip.
 *
 * Schedule (DeepSeek API docs, "Models & Pricing"):
 *   Peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday through Friday.
 *   All other hours are off-peak, including weekends and Chinese public
 *   holidays in full. Off-peak rates are half of the peak rates.
 *
 * Chinese public holidays are not computed (they need a yearly calendar): on
 * such a day the tracker shows PEAK while the API bills off-peak. Fill in
 * CHINESE_HOLIDAY_YMD below to correct that.
 */

window.__ModuleLoader__.load({
	id: "dsh-peak-hour-tracker",
	factory: (requireModule) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = requireModule("react");
		const h = React.createElement;

		//#region schedule
		/** Peak windows as [startMinute, endMinute) offsets from 00:00 UTC. */
		const PEAK_WINDOWS_UTC_MIN = [
			[60, 240],
			[360, 600]
		];
		/** UTC weekdays (0 = Sunday) that carry peak windows; weekends are all off-peak. */
		const PEAK_WEEKDAYS_UTC = [1, 2, 3, 4, 5];
		/**
		 * Chinese public holidays ("YYYY-MM-DD" in Beijing time), which the API
		 * bills entirely off-peak. Empty by default; fill in the current year's
		 * dates to have them treated as off-peak.
		 * @type {readonly string[]}
		 */
		const CHINESE_HOLIDAY_YMD = [];
		/** Minutes per day. */
		const DAY_MIN = 1440;
		/** Milliseconds per day. */
		const DAY_MS = 86400000;
		/** Milliseconds per minute. */
		const MIN_MS = 60000;
		/** Beijing time is UTC+8 with no daylight saving. */
		const CHINA_TZ = "Asia/Shanghai";
		/** Smallest gap kept between the floating panel and the frame edge. */
		const EDGE_MARGIN = 10;
		/** Pointer travel below this stays a click rather than a drag. */
		const DRAG_SLOP = 4;

		/**
		 * Epoch milliseconds of 00:00 UTC on the UTC day containing `ms`.
		 * @param ms - epoch milliseconds.
		 * @returns the UTC day start.
		 */
		function utcDayStart(ms) {
			const d = new Date(ms);
			return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
		}

		/**
		 * Beijing calendar date ("YYYY-MM-DD") of an instant, for holiday lookup.
		 * @param ms - epoch milliseconds.
		 * @returns the Beijing date key.
		 */
		function chinaDayKey(ms) {
			return chinaYmd.format(new Date(ms));
		}

		/**
		 * Whether one UTC day carries peak windows.
		 * @param dayStart - epoch milliseconds of 00:00 UTC.
		 * @returns true for Monday–Friday, excluding listed Chinese holidays.
		 */
		function isPeakDay(dayStart) {
			if (PEAK_WEEKDAYS_UTC.indexOf(new Date(dayStart).getUTCDay()) === -1) return false;
			return CHINESE_HOLIDAY_YMD.indexOf(chinaDayKey(dayStart)) === -1;
		}

		/**
		 * The alternating peak/off-peak segments of one UTC day.
		 * @param dayStart - epoch milliseconds of 00:00 UTC.
		 * @returns ordered segments with absolute bounds.
		 */
		function segmentsForDay(dayStart) {
			const out = [];
			let cursor = 0;
			if (isPeakDay(dayStart)) {
				for (const [start, end] of PEAK_WINDOWS_UTC_MIN) {
					if (start > cursor) out.push({ peak: false, start: dayStart + cursor * MIN_MS, end: dayStart + start * MIN_MS });
					out.push({ peak: true, start: dayStart + start * MIN_MS, end: dayStart + end * MIN_MS });
					cursor = end;
				}
			}
			if (cursor < DAY_MIN) out.push({ peak: false, start: dayStart + cursor * MIN_MS, end: dayStart + DAY_MIN * MIN_MS });
			return out;
		}

		/**
		 * Resolve the pricing window in force at an instant and when that window
		 * actually changes: consecutive same-state segments are merged, so a
		 * midnight boundary inside one long off-peak run (a weekend, or the hours
		 * after the last weekday window) is not reported as a switch.
		 * @param ms - epoch milliseconds.
		 * @returns the current window and the next switch instant.
		 */
		function resolveWindow(ms) {
			const first = utcDayStart(ms) - DAY_MS;
			const segments = [];
			for (let i = 0; i < 16; i += 1) {
				for (const segment of segmentsForDay(first + i * DAY_MS)) segments.push(segment);
			}
			for (let i = 0; i < segments.length; i += 1) {
				const segment = segments[i];
				if (ms < segment.start || ms >= segment.end) continue;
				const peak = segment.peak;
				let endsAt = segment.end;
				for (let j = i + 1; j < segments.length && segments[j].peak === peak; j += 1) endsAt = segments[j].end;
				return { peak, endsAt };
			}
			return { peak: false, endsAt: ms + DAY_MS };
		}
		//#endregion

		//#region formatting
		/** Local 24-hour clock with seconds. */
		const localClock = new Intl.DateTimeFormat(undefined, { hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
		/** Local 24-hour clock without seconds. */
		const localShort = new Intl.DateTimeFormat(undefined, { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
		/** Beijing 24-hour clock with seconds. */
		const chinaClock = new Intl.DateTimeFormat("en-GB", { timeZone: CHINA_TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" });
		/** UTC 24-hour clock without seconds, for the switch instant. */
		const utcShort = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
		/** Beijing calendar parts, for holiday keys. */
		const chinaYmd = new Intl.DateTimeFormat("en-CA", { timeZone: CHINA_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

		/**
		 * Two-digit zero padding.
		 * @param value - a small non-negative integer.
		 * @returns the padded string.
		 */
		function pad2(value) {
			return value < 10 ? "0" + String(value) : String(value);
		}

		/**
		 * Human-readable remaining time, coarse at the top and precise at the bottom.
		 * @param ms - milliseconds remaining.
		 * @returns the formatted duration.
		 */
		function formatDuration(ms) {
			const total = Math.max(0, Math.floor(ms / 1000));
			const days = Math.floor(total / 86400);
			const hours = Math.floor((total % 86400) / 3600);
			const minutes = Math.floor((total % 3600) / 60);
			const seconds = total % 60;
			if (days > 0) return String(days) + "d " + String(hours) + "h";
			if (hours > 0) return String(hours) + "h " + pad2(minutes) + "m";
			return String(minutes) + "m " + pad2(seconds) + "s";
		}

		/**
		 * Everything the panel displays for one instant.
		 * @param ms - epoch milliseconds.
		 * @returns the derived view model.
		 */
		function describe(ms) {
			const instant = new Date(ms);
			const current = resolveWindow(ms);
			const remaining = Math.max(0, current.endsAt - ms);
			return {
				now: ms,
				dayKey: instant.toDateString(),
				peak: current.peak,
				stateKey: current.peak ? "peak" : "off",
				stateLabel: current.peak ? "PEAK" : "OFF-PEAK",
				nextLabel: current.peak ? "off-peak" : "peak",
				eta: formatDuration(remaining),
				localTime: localClock.format(instant),
				chinaTime: chinaClock.format(instant),
				switchAt: localShort.format(new Date(current.endsAt)) + " local · " + utcShort.format(new Date(current.endsAt)) + " UTC"
			};
		}

		/**
		 * Plain-text description used for accessible names.
		 * @param view - the derived view model.
		 * @returns the description.
		 */
		function describeLabel(view) {
			return view.stateLabel + " — local " + view.localTime + ", China " + view.chinaTime + ", " + view.nextLabel + " in " + view.eta;
		}

		/**
		 * Peak ranges of the viewer's own local day, so the expanded panel can state
		 * the schedule in the clock the user actually reads. Scans the day in
		 * minutes, which stays correct across a daylight-saving shift.
		 * @param ms - epoch milliseconds.
		 * @returns formatted "HH:MM–HH:MM" ranges, empty when the day has none.
		 */
		function localPeakRanges(ms) {
			const now = new Date(ms);
			const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
			const ranges = [];
			let open = -1;
			for (let minute = 0; minute < DAY_MIN; minute += 1) {
				const peak = resolveWindow(dayStart + minute * MIN_MS).peak;
				if (peak && open === -1) open = minute;
				else if (!peak && open !== -1) {
					ranges.push([open, minute]);
					open = -1;
				}
			}
			if (open !== -1) ranges.push([open, DAY_MIN]);
			return ranges.map(([from, to]) => localShort.format(new Date(dayStart + from * MIN_MS)) + "–" + localShort.format(new Date(dayStart + to * MIN_MS)));
		}

		/**
		 * Convert a dragged top-left corner into the frame-anchored offsets the
		 * panel renders from, clamped so it always stays inside the viewport.
		 * @param left - dragged top-left x.
		 * @param top - dragged top-left y.
		 * @param width - panel width.
		 * @param height - panel height.
		 * @returns the clamped right/bottom offsets.
		 */
		function dragOffsets(left, top, width, height) {
			const viewportWidth = typeof window.innerWidth === "number" ? window.innerWidth : 0;
			const viewportHeight = typeof window.innerHeight === "number" ? window.innerHeight : 0;
			const maxRight = Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN);
			const maxBottom = Math.max(EDGE_MARGIN, viewportHeight - height - EDGE_MARGIN);
			return {
				right: Math.min(maxRight, Math.max(EDGE_MARGIN, viewportWidth - left - width)),
				bottom: Math.min(maxBottom, Math.max(EDGE_MARGIN, viewportHeight - top - height))
			};
		}
		//#endregion

		//#region store
		/** Persistence key for placement preferences. */
		const STORAGE_KEY = "dsh-peak-hour-tracker/prefs/v1";
		/** Preferences that survive a reload; the expanded reveal does not. */
		const PERSISTED_KEYS = ["mode", "right", "bottom"];
		/** The two placements. */
		const MODES = ["float", "sidebar"];

		/**
		 * Read persisted preferences, tolerating unavailable or corrupt storage.
		 * @returns the effective preferences.
		 */
		function readPrefs() {
			const prefs = { mode: "float", right: null, bottom: null, expanded: false };
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (typeof raw === "string" && raw !== "") {
					const stored = JSON.parse(raw);
					if (stored !== null && typeof stored === "object") for (const key of PERSISTED_KEYS) if (stored[key] !== undefined) prefs[key] = stored[key];
				}
			} catch {
				/* storage unavailable: fall through to defaults */
			}
			if (MODES.indexOf(prefs.mode) === -1) prefs.mode = "float";
			return prefs;
		}

		let prefs = readPrefs();
		const prefListeners = new Set();

		/**
		 * Subscribe to preference changes.
		 * @param listener - the change callback.
		 * @returns the unsubscriber.
		 */
		function subscribePrefs(listener) {
			prefListeners.add(listener);
			return () => {
				prefListeners.delete(listener);
			};
		}

		/**
		 * Current preferences (stable identity until a change).
		 * @returns the preferences object.
		 */
		function getPrefs() {
			return prefs;
		}

		/**
		 * Merge a patch into preferences, persist the durable subset, and notify.
		 * @param patch - the changed keys.
		 */
		function setPrefs(patch) {
			let changed = false;
			const next = { ...prefs };
			for (const key of Object.keys(patch)) {
				if (next[key] !== patch[key]) {
					next[key] = patch[key];
					changed = true;
				}
			}
			if (!changed) return;
			prefs = next;
			try {
				const durable = {};
				for (const key of PERSISTED_KEYS) durable[key] = prefs[key];
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
			} catch {
				/* storage unavailable: keep the in-memory preference */
			}
			for (const listener of Array.from(prefListeners)) listener();
		}

		/**
		 * Subscribe a component to preferences.
		 * @returns the live preferences.
		 */
		function usePrefs() {
			return React.useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
		}

		/** Shared one-second clock so both placements tick off one timer. */
		const clockListeners = new Set();
		let clockTimer = null;
		let clockNow = Date.now();

		/**
		 * Subscribe to the shared clock.
		 * @param listener - the tick callback.
		 * @returns the unsubscriber.
		 */
		function subscribeClock(listener) {
			clockListeners.add(listener);
			if (clockTimer === null) {
				clockNow = Date.now();
				clockTimer = setInterval(() => {
					clockNow = Date.now();
					for (const current of Array.from(clockListeners)) current();
				}, 1000);
			}
			return () => {
				clockListeners.delete(listener);
				if (clockListeners.size === 0 && clockTimer !== null) {
					clearInterval(clockTimer);
					clockTimer = null;
				}
			};
		}

		/**
		 * Current clock instant.
		 * @returns epoch milliseconds.
		 */
		function getNow() {
			return clockNow;
		}

		/**
		 * Subscribe a component to the shared clock.
		 * @returns the current epoch milliseconds.
		 */
		function useNow() {
			return React.useSyncExternalStore(subscribeClock, getNow, getNow);
		}
		//#endregion

		//#region styles
		// Every surface carries the token block: the sidebar panel and the rail sit
		// outside the overlay, so they cannot inherit it from there.
		const TOKENS = "--dph-off:var(--dsw-alias-state-business-primary,var(--dsw-static-deepseek-500,#4d6bfe));--dph-on:var(--dsw-alias-state-warn-primary,var(--dsw-static-amber-500,#d99b00));--dph-line:var(--dsw-alias-border-l1,rgba(0,0,0,.08));--dph-line-2:var(--dsw-alias-border-l2,rgba(0,0,0,.12));--dph-surface:var(--dsw-specific-menu,#fff);--dph-ink:var(--dsw-alias-label-primary,#1b1b1b);--dph-ink-2:var(--dsw-alias-label-secondary,#5c5c5c);--dph-ink-3:var(--dsw-alias-label-tertiary,#8a8a8a);--dph-hover:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));--dph-mono:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-family:var(--dsw-font-family,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif);color:var(--dph-ink)";
		// The state colour plus two lighter bands, used as the dot's halo.
		const STATE_TOKEN =
			".dph-panel[data-state=off],.dph-rail[data-state=off],.dph-float[data-state=off]{--dph-state:var(--dph-off);--dph-band-1:color-mix(in srgb,var(--dph-off) 34%,transparent);--dph-band-2:color-mix(in srgb,var(--dph-off) 14%,transparent)}" +
			".dph-panel[data-state=peak],.dph-rail[data-state=peak],.dph-float[data-state=peak]{--dph-state:var(--dph-on);--dph-band-1:color-mix(in srgb,var(--dph-on) 34%,transparent);--dph-band-2:color-mix(in srgb,var(--dph-on) 14%,transparent)}";
		const CSS =
			".dph-overlay,.dph-panel,.dph-rail{" + TOKENS + "}" +
			".dph-overlay{position:absolute;inset:0;z-index:6}" +
			"body .dph-overlay{pointer-events:none}" +
			STATE_TOKEN +
			".dph-float{position:absolute;right:16px;bottom:16px;pointer-events:auto}" +
			".dph-panel{box-sizing:border-box;display:flex;flex-direction:column;gap:9px;min-width:146px;padding:10px 12px 11px;border:1px solid var(--dph-line-2);border-radius:12px;background-color:var(--dsw-alias-bg-layer-1,#fff);background-image:linear-gradient(var(--dph-surface,transparent),var(--dph-surface,transparent));color:var(--dph-ink);box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.16));user-select:none;transition:border-color .12s ease}" +
			".dph-float .dph-panel{cursor:grab;touch-action:none}" +
			".dph-float .dph-panel:active{cursor:grabbing}" +
			".dph-panel--wide{width:100%;min-width:0;margin:2px 0;cursor:pointer}" +
			".dph-panel--wide:hover{border-color:var(--dph-line-2)}" +
			".dph-panel--wide:focus-visible{outline:2px solid var(--dph-off);outline-offset:2px}" +
			".dph-status{display:flex;align-items:center;gap:10px}" +
			".dph-dot{box-sizing:border-box;flex:none;width:8px;height:8px;border-radius:50%;corner-shape:round;background:var(--dph-state,var(--dph-ink-3));box-shadow:0 0 0 2px var(--dph-band-1,transparent),0 0 0 4px var(--dph-band-2,transparent)}" +
			".dph-state{font-size:11px;font-weight:650;letter-spacing:.06em;color:var(--dph-state,var(--dph-ink))}" +
			".dph-mode{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dph-ink-3);cursor:pointer;transition:background-color .12s ease,color .12s ease}" +
			".dph-mode:hover{background:var(--dph-hover);color:var(--dph-ink)}" +
			".dph-mode:focus-visible{outline:2px solid var(--dph-off);outline-offset:1px}" +
			".dph-times{display:grid;grid-template-columns:auto 1fr;column-gap:16px;row-gap:3px;align-items:baseline}" +
			".dph-label{font-size:9px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dph-ink-3)}" +
			".dph-value{justify-self:end;font-family:var(--dph-mono);font-size:12.5px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;color:var(--dph-ink)}" +
			".dph-eta{display:flex;align-items:baseline;gap:10px;padding-top:8px;border-top:1px solid var(--dph-line);font-family:var(--dph-mono);font-size:10.5px;white-space:nowrap}" +
			".dph-eta-label{color:var(--dph-ink-2)}" +
			".dph-eta-value{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums;color:var(--dph-state,var(--dph-ink))}" +
			".dph-details{display:flex;flex-direction:column;gap:7px;padding-top:8px;border-top:1px solid var(--dph-line)}" +
			".dph-details .dph-value{white-space:normal;text-align:right;line-height:1.35}" +
			".dph-note{font-size:10px;line-height:1.5;color:var(--dph-ink-3)}" +
			".dph-rail{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:36px;height:36px;margin:0;padding:0;border:0;border-radius:50%;corner-shape:round;background:transparent;cursor:pointer;transition:background-color .12s ease}" +
			".dph-rail:hover{background:var(--dph-hover)}" +
			".dph-rail:focus-visible{outline:2px solid var(--dph-off);outline-offset:-2px}" +
			"@media (prefers-reduced-motion:reduce){.dph-panel,.dph-mode,.dph-rail{transition:none}}";
		const CSS_TAG_ID = "dsh-peak-hour-tracker/peak-hours.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-peak-hour-tracker";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region view
		/**
		 * The state mark: one filled dot circled by two lighter bands of the same
		 * colour.
		 * @returns the dot element.
		 */
		function Dot() {
			return h("span", { className: "dph-dot", "data-ph": "dot", "aria-hidden": "true" });
		}

		/**
		 * The placement glyph.
		 * @param props - the current placement.
		 * @returns the icon element.
		 */
		function ModeIcon(props) {
			const common = { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
			// Docked: a box with an arrow leaving its top-right corner.
			if (props.docked) {
				return h(
					"svg",
					{ ...common, "data-ph": "popout-icon" },
					h("path", { d: "M9.5 2.5H4.5A2 2 0 0 0 2.5 4.5v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-5" }),
					h("path", { d: "M10.5 2.5h3v3" }),
					h("path", { d: "M13.5 2.5 8.5 7.5" })
				);
			}
			// Floating: a vertical edge with an arrow pointing at it.
			return h("svg", { ...common, "data-ph": "dock-icon" }, h("path", { d: "M3 2.5v11" }), h("path", { d: "M13 8H6.5" }), h("path", { d: "M9.5 5 6.5 8l3 3" }));
		}

		/**
		 * The information panel, rendered identically in both placements. Clicking
		 * the sidebar copy reveals the extra rows; the floating copy is drag-only.
		 * @param props - the view model, width mode, drag handlers, and callbacks.
		 * @returns the panel element.
		 */
		function Panel(props) {
			const view = props.view;
			const docked = props.docked === true;
			const clickable = typeof props.onPress === "function";
			const expanded = clickable && props.expanded === true;
			const todayRanges = React.useMemo(() => localPeakRanges(view.now), [view.dayKey]);
			const toggle = props.onToggleMode;
			return h(
				"div",
				{
					className: "dph-panel" + (props.wide ? " dph-panel--wide" : "") + (expanded ? " dph-panel--expanded" : ""),
					"data-ph": props.wide ? "sidebar-panel" : "panel",
					"data-state": view.stateKey,
					role: clickable ? "button" : "group",
					tabIndex: clickable ? 0 : undefined,
					"aria-expanded": clickable ? expanded : undefined,
					"aria-label": describeLabel(view) + (clickable ? (expanded ? " — press to hide the schedule details" : " — press to show the schedule details") : ""),
					onClick: clickable ? props.onPress : undefined,
					onKeyDown:
						clickable &&
						((event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								props.onPress();
							}
						}),
					...props.handlers
				},
				h(
					"div",
					{ className: "dph-status" },
					h(Dot),
					h("span", { className: "dph-state" }, view.stateLabel),
					toggle === undefined
						? null
						: h(
								"button",
								{
									type: "button",
									className: "dph-mode",
									"data-ph": "mode-toggle",
									"aria-label": docked ? "Pop the peak-hours panel out" : "Move the peak-hours panel into the sidebar",
									onClick: (event) => {
										if (event !== undefined && typeof event.stopPropagation === "function") event.stopPropagation();
										toggle();
									},
									onPointerDown: (event) => {
										if (event !== undefined && typeof event.stopPropagation === "function") event.stopPropagation();
									}
								},
								h(ModeIcon, { docked })
							)
				),
				h(
					"div",
					{ className: "dph-times" },
					h("span", { className: "dph-label" }, "Local"),
					h("span", { className: "dph-value" }, view.localTime),
					h("span", { className: "dph-label" }, "China"),
					h("span", { className: "dph-value" }, view.chinaTime)
				),
				h("div", { className: "dph-eta" }, h("span", { className: "dph-eta-label" }, "→ " + view.nextLabel + " in"), h("span", { className: "dph-eta-value" }, view.eta)),
				expanded
					? h(
							"div",
							{ className: "dph-details", "data-ph": "details" },
							h("div", { className: "dph-times" }, h("span", { className: "dph-label" }, "Switch"), h("span", { className: "dph-value" }, view.switchAt)),
							h("div", { className: "dph-times" }, h("span", { className: "dph-label" }, "Today"), h("span", { className: "dph-value" }, todayRanges.length === 0 ? "no peak window" : todayRanges.join(" · "))),
							h("div", { className: "dph-note" }, "Peak Mon–Fri 01:00–04:00 and 06:00–10:00 UTC · off-peak is half price")
						)
					: null
			);
		}

		/**
		 * Drag behaviour for the floating panel.
		 * @returns the pointer handlers.
		 */
		function usePanelDrag() {
			const drag = React.useRef(null);
			const onPointerDown = (event) => {
				if (event.button !== undefined && event.button !== 0) return;
				const rect = typeof event.currentTarget.getBoundingClientRect === "function" ? event.currentTarget.getBoundingClientRect() : { left: 0, top: 0, width: 146, height: 96 };
				drag.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height, startX: event.clientX, startY: event.clientY };
				if (typeof event.currentTarget.setPointerCapture === "function" && typeof event.pointerId === "number") event.currentTarget.setPointerCapture(event.pointerId);
			};
			const onPointerMove = (event) => {
				const state = drag.current;
				if (state === null) return;
				if (Math.abs(event.clientX - state.startX) + Math.abs(event.clientY - state.startY) < DRAG_SLOP) return;
				setPrefs(dragOffsets(event.clientX - state.offsetX, event.clientY - state.offsetY, state.width, state.height));
			};
			const onPointerUp = () => {
				drag.current = null;
			};
			return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
		}

		/**
		 * Floating placement: the draggable panel.
		 * @returns the positioned panel, or null in the sidebar placement.
		 */
		function FloatingPanel() {
			const current = usePrefs();
			const view = describe(useNow());
			const drag = usePanelDrag();
			if (current.mode !== "float") return null;
			const style = current.right !== null && current.bottom !== null ? { right: current.right + "px", bottom: current.bottom + "px" } : undefined;
			return h("div", { className: "dph-float", style, "data-ph": "float", "data-state": view.stateKey }, h(Panel, { view, handlers: drag, onToggleMode: () => setPrefs({ mode: "sidebar", expanded: false }) }));
		}

		/**
		 * Sidebar placement: the same panel in the sidebar foot, above Settings.
		 * @param props - sidebar owner share (`wide`).
		 * @returns the panel in a wide sidebar, the dot-only rail button when
		 *   collapsed, or null in the floating placement.
		 */
		function SidebarEntry(props) {
			const current = usePrefs();
			const view = describe(useNow());
			if (current.mode !== "sidebar") return null;
			if (props !== undefined && props !== null && props.wide === false) {
				return h(
					"button",
					{
						type: "button",
						className: "dph-rail",
						"data-ph": "rail",
						"data-state": view.stateKey,
						"aria-label": describeLabel(view) + " — press to float the panel",
						onClick: () => setPrefs({ mode: "float", expanded: false })
					},
					h(Dot)
				);
			}
			return h(Panel, { view, wide: true, docked: true, expanded: current.expanded, onPress: () => setPrefs({ expanded: !current.expanded }), onToggleMode: () => setPrefs({ mode: "float", expanded: false }) });
		}

		/**
		 * Frame-wide overlay: hosts the floating panel.
		 * @returns the overlay element.
		 */
		function OverlayRoot() {
			const view = describe(useNow());
			return h("div", { className: "dph-overlay", "data-ph": "overlay", "data-state": view.stateKey }, h(FloatingPanel));
		}
		//#endregion

		//#region plugin
		/** Required services: the slot registry both entries register into. */
		const inject = ["slots"];

		/**
		 * Client plugin body: contribute the tracker to the frame-wide overlay and
		 * to the sidebar foot.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "peak-hours", order: 40, label: "Peak hours" }, OverlayRoot));
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "peak-hours", order: 10, label: "Peak hours" }, SidebarEntry));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
