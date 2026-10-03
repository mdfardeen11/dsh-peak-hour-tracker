/**
 * Peak/off-peak hours tracker — node half.
 *
 * Pure UI plugin: this empty apply exists only so the package can be a Loader
 * entry in the profile tree (the host scans enabled entries for the browser
 * roster). The browser half ships through exports["./client"] and is
 * discovered from the package.json `dsh.client` declaration; nothing here runs
 * model-facing code.
 */

/** Host plugin body — no host-side behaviour for this source plugin. */
export function apply() {}
