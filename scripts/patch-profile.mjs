#!/usr/bin/env node
/**
 * Profile patch helper for dsh-peak-hour-tracker's install scripts.
 *
 * The install scripts copy the package into a profile's `node_modules` and then
 * need one Loader row in that profile's `cordis.patch.yml`. This keeps that
 * file edit in one place instead of three (PowerShell, bash, and any future
 * shell), and keeps it honest:
 *
 *   add    <patchFile> <rowId> <package>   insert the row, replacing a bare `[]`
 *   remove <patchFile> <rowId> <package>   delete the row, leaving a valid array
 *   bundle <profileManifest> <package>     exit 0 when the package is already a
 *                                          profile bundle layer (standard install)
 *
 * Every path is treated as text, never parsed as YAML, so comments and any other
 * entries survive byte-for-byte.
 *
 * @module scripts/patch-profile
 */

import { readFileSync, writeFileSync } from "node:fs";

/** Exit code used when a check answers "no" without being an error. */
const NO = 1;

/**
 * Render one insert row.
 * @param rowId - the Loader entry id.
 * @param packageName - the package the entry resolves.
 * @returns the YAML block, newline-terminated.
 */
function insertRow(rowId, packageName) {
	return `- insert:\n    - id: ${rowId}\n      name: '${packageName}'`;
}

/**
 * Whether a patch file already names the package.
 * @param text - the current file text.
 * @param packageName - the package to look for.
 * @returns true when a row for the package exists.
 */
function hasRow(text, packageName) {
	return text.includes(`name: '${packageName}'`) || text.includes(`name: "${packageName}"`);
}

/**
 * Whether a patch file holds any real content (a row), ignoring comments.
 * @param text - the current file text.
 * @returns true when at least one entry line exists.
 */
function hasEntries(text) {
	return text.split(/\r?\n/).some((line) => line.trim() !== "" && !line.trim().startsWith("#"));
}

/**
 * Insert the Loader row, replacing a bare empty array when that is all there is.
 * @param file - the patch file path.
 * @param rowId - the Loader entry id.
 * @param packageName - the package the entry resolves.
 * @returns the message to print.
 */
function add(file, rowId, packageName) {
	const text = readFileSync(file, "utf8");
	if (hasRow(text, packageName)) return `loader row already present in ${file}`;
	const row = insertRow(rowId, packageName);
	const replaced = /^[ \t]*\[[ \t]*\][ \t]*$/m.test(text) ? text.replace(/^[ \t]*\[[ \t]*\][ \t]*$/m, row) : `${text.trimEnd()}\n\n${row}`;
	writeFileSync(file, `${replaced.trimEnd()}\n`);
	return `added loader row -> ${file}`;
}

/**
 * Remove the Loader row, leaving a parseable array behind.
 * @param file - the patch file path.
 * @param rowId - the Loader entry id.
 * @param packageName - the package the entry resolves.
 * @returns the message to print.
 */
function remove(file, rowId, packageName) {
	const text = readFileSync(file, "utf8");
	const block = new RegExp(`^- insert:\\r?\\n[ \\t]+- id: ${rowId}\\r?\\n[ \\t]+name: ['"]${packageName}['"]\\r?\\n?`, "m");
	const without = text.replace(block, "");
	if (without === text) return `no loader row for ${packageName} in ${file}`;
	const next = hasEntries(without) ? without : `${without.trimEnd()}\n[]\n`;
	writeFileSync(file, `${next.trimEnd()}\n`);
	return `removed loader row -> ${file}`;
}

/**
 * Report whether the package is already a profile bundle layer.
 * @param manifestPath - the profile's package.json.
 * @param packageName - the package to look for.
 * @returns the exit code (0 when it is a bundle).
 */
function bundle(manifestPath, packageName) {
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const bundles = (manifest.dsh?.profile?.bundles ?? []).map(String);
	return bundles.includes(packageName) ? 0 : NO;
}

const [command, ...args] = process.argv.slice(2);
const usage = "usage: patch-profile.mjs add|remove <patchFile> <rowId> <package> | bundle <profileManifest> <package>";

if (command === "add" && args.length === 3) console.log(add(args[0], args[1], args[2]));
else if (command === "remove" && args.length === 3) console.log(remove(args[0], args[1], args[2]));
else if (command === "bundle" && args.length === 2) process.exit(bundle(args[0], args[1]));
else {
	console.error(usage);
	process.exit(2);
}
