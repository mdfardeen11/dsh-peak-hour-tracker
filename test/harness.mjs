/**
 * Shared test harness for dsh-peak-hour-tracker.
 *
 * The plugin bundle is a browser classic script: it hands a factory to
 * `window.__ModuleLoader__`. This module stubs the browser surface the bundle
 * touches (loader, React, `localStorage`, `document`), materializes the factory,
 * and exposes the real components plus a small renderer so tests can drive them
 * through their own handlers.
 *
 * @module test/harness
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute URL of the browser bundle under test. */
export const BUNDLE_PATH = pathToFileURL(join(here, "..", "lib", "client.js")).href;
/** The package name, which is also the module-loader registration id. */
export const PLUGIN_ID = "dsh-peak-hour-tracker";
/** The preference key the plugin persists under. */
export const STORAGE_KEY = "dsh-peak-hour-tracker/prefs/v1";

/**
 * Minimal React stand-in: no renderer, just the hooks the components call and a
 * `createElement` that yields an inspectable tree.
 * @returns the fake React module.
 */
function createFakeReact() {
	let hookIndex = 0;
	return {
		createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
		useState: (initial) => {
			hookIndex += 1;
			return [typeof initial === "function" ? initial() : initial, () => {}];
		},
		useEffect: () => {},
		useMemo: (factory) => factory(),
		useRef: (initial) => ({ current: initial === undefined ? null : initial }),
		useSyncExternalStore: (subscribe, getSnapshot) => {
			const unsubscribe = subscribe(() => {});
			if (typeof unsubscribe === "function") unsubscribe();
			return getSnapshot();
		},
		resetHooks: () => {
			hookIndex = 0;
		}
	};
}

/** The factory the bundle registered; captured once per process. */
let capturedRegistration;

/**
 * Install the browser globals the bundle reads, with in-memory storage.
 * @returns the storage double.
 */
function installBrowser() {
	const memory = new Map();
	globalThis.window = {
		__ModuleLoader__: {
			load: (value) => {
				capturedRegistration = value;
			}
		},
		innerWidth: 1200,
		innerHeight: 800,
		localStorage: {
			getItem: (key) => (memory.has(key) ? memory.get(key) : null),
			setItem: (key, value) => {
				memory.set(key, String(value));
			},
			removeItem: (key) => {
				memory.delete(key);
			}
		}
	};
	globalThis.document = undefined;
	return memory;
}

/**
 * Materialize the plugin bundle and return its registration plus test helpers.
 * @returns the loaded plugin, its slot entries, and the render helpers.
 */
export async function loadPlugin(options = {}) {
	const services = options.services ?? {};
	const memory = installBrowser();
	// The bundle is an ES module, so it evaluates once per process: reuse the
	// factory captured by the first load, and build a fresh instance per call.
	if (capturedRegistration === undefined) await import(BUNDLE_PATH);
	const registration = capturedRegistration;
	if (registration === undefined) throw new Error("the bundle did not register a factory");
	if (registration.id !== PLUGIN_ID) throw new Error(`factory id is ${registration.id}, expected ${PLUGIN_ID}`);

	const react = createFakeReact();
	const requireStub = (spec) => {
		if (spec === "react") return react;
		throw new Error("unexpected module request: " + spec);
	};

	// The bundle injects its stylesheet at factory time; capture it the way a
	// browser would so tests can assert on the CSS it ships.
	let capturedCss = "";
	globalThis.document = {
		querySelector: () => null,
		createElement: () => ({ dataset: {}, textContent: "" }),
		head: {
			appendChild: (tag) => {
				capturedCss = tag.textContent;
			}
		}
	};
	const plugin = registration.factory(requireStub);
	globalThis.document = undefined;

	const entries = new Map();
	plugin.apply({
		slots: {
			inject: (slotName, register) => {
				register();
			},
			register: (options, component) => {
				entries.set(options.name, { options, component });
				return () => {};
			}
		},
		effect: () => () => {},
		get: (name) => services[name]
	});

	/**
	 * Render a component and collect host nodes plus their text in document order.
	 * @param component - the component to render.
	 * @param props - its props.
	 * @returns the flattened nodes and text.
	 */
	function render(component, props) {
		react.resetHooks();
		const nodes = [];
		const parts = [];
		const walk = (node) => {
			if (Array.isArray(node)) {
				for (const child of node) walk(child);
				return;
			}
			if (node === null || node === undefined || typeof node === "boolean") return;
			if (typeof node !== "object") {
				parts.push(String(node));
				return;
			}
			if (typeof node.type === "function") {
				react.resetHooks();
				walk(node.type(node.props));
				return;
			}
			nodes.push(node);
			if (node.children !== undefined) walk(node.children);
		};
		walk(component(props));
		return {
			nodes,
			text: parts.join(" | "),
			find: (marker) => nodes.find((node) => node.props["data-ph"] === marker)
		};
	}

	/**
	 * Render with the clock frozen at an instant.
	 * @param component - the component to render.
	 * @param props - its props.
	 * @param iso - the UTC instant to freeze the clock at.
	 * @returns the rendered tree.
	 */
	function at(component, props, iso) {
		const frozen = Date.parse(iso);
		const realNow = Date.now;
		Date.now = () => frozen;
		try {
			return render(component, props);
		} finally {
			Date.now = realNow;
		}
	}

	return {
		plugin,
		entries,
		capturedCss,
		storage: {
			memory,
			/**
			 * Read one persisted key.
			 * @param key - the storage key.
			 * @returns the raw value, or undefined.
			 */
			raw: (key) => memory.get(key),
			/**
			 * Read the persisted preferences.
			 * @returns the parsed preferences, or an empty object.
			 */
			prefs: () => {
				const raw = memory.get(STORAGE_KEY);
				return raw === undefined ? {} : JSON.parse(raw);
			}
		},
		/**
		 * Render the frame-wide overlay entry at a frozen instant.
		 * @param iso - the UTC instant to freeze the clock at.
		 * @returns the rendered tree.
		 */
		overlayAt: (iso) => at(entries.get("shell.overlay").component, {}, iso),
		/**
		 * Render the sidebar foot entry at a frozen instant.
		 * @param iso - the UTC instant to freeze the clock at.
		 * @param props - the sidebar owner share.
		 * @returns the rendered tree.
		 */
		sidebarAt: (iso, props) => at(entries.get("sidebar.footer.action").component, props, iso),
		render,
		at,
		/**
		 * Flatten a rendered tree to a comparable one-line string.
		 * @param view - a rendered tree.
		 * @returns the collapsed text.
		 */
		strip: (view) => view.text.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim(),
		/**
		 * Perform a pointer gesture on the floating panel.
		 * @param element - the panel host node.
		 * @param from - gesture start point.
		 * @param to - optional gesture end point.
		 */
		gesture: (element, from, to) => {
			const target = {
				getBoundingClientRect: () => ({ left: 0, top: 0, width: 146, height: 96, right: 146, bottom: 96 }),
				setPointerCapture: () => {}
			};
			const props = element.props;
			props.onPointerDown({ button: 0, pointerId: 1, clientX: from[0], clientY: from[1], currentTarget: target });
			if (to !== undefined) props.onPointerMove({ pointerId: 1, clientX: to[0], clientY: to[1], currentTarget: target });
			props.onPointerUp({ pointerId: 1 });
		}
	};
}
