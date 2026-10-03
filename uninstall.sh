#!/usr/bin/env bash
#
# Removes dsh-peak-hour-tracker from a DeepSeek Harness web profile (macOS/Linux).
#
# Deletes the Loader row from the profile's cordis.patch.yml, waits for the
# running server to drop the entry, and only then removes the copied package.
# That order matters: deleting the package directory while the entry is still
# live leaves a stale entry in the host's composition until a restart, so leave
# the wait in place.
#
# Usage: ./uninstall.sh [profile] [settle-seconds]     (defaults: web, 2)

set -euo pipefail

profile="${1:-web}"
settle="${2:-2}"
package_name="dsh-peak-hour-tracker"
row_id="ui-peak-hours"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile_dir="$dsh_home/profiles/$profile"
profile_manifest="$profile_dir/package.json"
patch_file="$profile_dir/cordis.patch.yml"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$source_dir/scripts/patch-profile.mjs"

if [ -f "$profile_manifest" ] && node "$helper" bundle "$profile_manifest" "$package_name"; then
	echo "note: $package_name is a profile bundle layer here - remove it with 'dsh plugin --profile $profile remove $package_name'"
fi

if [ -f "$patch_file" ]; then
	node "$helper" remove "$patch_file" "$row_id" "$package_name"
fi

if [ "$settle" != "0" ]; then
	echo "waiting ${settle}s for the live patch watcher to drop the entry..."
	sleep "$settle"
fi

target="$profile_dir/node_modules/$package_name"
if [ -d "$target" ]; then
	rm -rf "$target"
	echo "removed package -> $target"
fi

echo
echo "Done. Reload the DSH web page to drop the tracker."
