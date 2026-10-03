/**
 * Runs `test/timezones.test.mjs` once per time zone.
 *
 * The zones are chosen to cover the whole world: both edges of the date line,
 * the half-hour and 45-minute offsets, both hemispheres' daylight-saving rules,
 * and the zones DeepSeek users are most likely to sit in. Each run is a fresh
 * process with `TZ` set, because the plugin — like any browser code — reads the
 * ambient zone from `Intl`, which Node resolves at start-up.
 *
 * Child output is inherited, so a failing zone is readable in the same stream.
 *
 *   node test/run-timezones.mjs
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const suite = join(here, "timezones.test.mjs");

/** Zones spread across the globe, including fractional offsets and DST rules. */
const ZONES = [
	"Pacific/Midway", // UTC-11:00
	"Pacific/Honolulu", // UTC-10:00
	"America/Anchorage", // UTC-09:00 / -08:00
	"America/Los_Angeles", // UTC-08:00 / -07:00
	"America/Denver", // UTC-07:00 / -06:00
	"America/Chicago", // UTC-06:00 / -05:00
	"America/New_York", // UTC-05:00 / -04:00
	"America/Sao_Paulo", // UTC-03:00
	"Atlantic/Azores", // UTC-01:00 / +00:00
	"UTC", // the reference
	"Europe/London", // UTC+00:00 / +01:00
	"Europe/Berlin", // UTC+01:00 / +02:00
	"Africa/Cairo", // UTC+02:00
	"Europe/Moscow", // UTC+03:00
	"Asia/Tehran", // UTC+03:30
	"Asia/Dubai", // UTC+04:00
	"Asia/Kolkata", // UTC+05:30
	"Asia/Kathmandu", // UTC+05:45
	"Asia/Dhaka", // UTC+06:00
	"Asia/Shanghai", // UTC+08:00 — the schedule's published zone
	"Asia/Tokyo", // UTC+09:00
	"Australia/Adelaide", // UTC+09:30 / +10:30
	"Australia/Sydney", // UTC+10:00 / +11:00
	"Pacific/Auckland", // UTC+12:00 / +13:00
	"Pacific/Kiritimati" // UTC+14:00
];

let failed = 0;
for (const zone of ZONES) {
	console.log(`\n== TZ=${zone} ==`);
	const result = spawnSync(process.execPath, [suite], { stdio: "inherit", env: { ...process.env, TZ: zone } });
	if (result.status !== 0) {
		failed += 1;
		console.error(`FAILED in ${zone}`);
	}
}

if (failed > 0) {
	console.error(`\n${failed} of ${ZONES.length} time zones failed`);
	process.exit(1);
}
console.log(`\nall ${ZONES.length} time zones passed`);
