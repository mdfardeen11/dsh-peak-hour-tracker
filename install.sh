#!/usr/bin/env bash
#
# Installs dsh-peak-hour-tracker into a DeepSeek Harness web profile (macOS/Linux).
#
# The no-pnpm route: copies this package into the profile's node_modules and adds
# one Loader row to the profile's cordis.patch.yml. The web profile ships with
# `patchReload: live`, so the row is composed while the server keeps running;
# refresh the browser once afterwards and the tracker appears.
#
# If the package was already installed the standard way (`dsh plugin --profile
# web add ...`, which adds it as a profile bundle layer), this script detects that
# and leaves the Loader row alone - writing it too would insert a duplicate entry.
#
# Usage: ./install.sh [profile]     (default profile: web)

set -euo pipefail

profile="${1:-web}"
package_name="dsh-peak-hour-tracker"
row_id="ui-peak-hours"
dsh_home="${DSH_HOME:-$HOME/.dsh}"
profile_dir="$dsh_home/profiles/$profile"
profile_manifest="$profile_dir/package.json"
patch_file="$profile_dir/cordis.patch.yml"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$source_dir/scripts/patch-profile.mjs"

if [ ! -f "$profile_manifest" ]; then
	echo "dsh: profile '$profile' not found at $profile_dir (expected a package.json there)" >&2
	exit 1
fi

target="$profile_dir/node_modules/$package_name"
mkdir -p "$target"
cp "$source_dir/package.json" "$target/package.json"
cp -R "$source_dir/lib" "$target/lib"
for extra in README.md LICENSE; do
	[ -f "$source_dir/$extra" ] && cp "$source_dir/$extra" "$target/$extra"
done
echo "installed package -> $target"

[ -f "$patch_file" ] || printf '[]\n' > "$patch_file"

if node "$helper" bundle "$profile_manifest" "$package_name"; then
	echo "already a profile bundle layer - leaving $patch_file alone"
else
	node "$helper" add "$patch_file" "$row_id" "$package_name"
fi

echo
echo "Done. Reload the DSH web page to mount the tracker."
echo "To remove it again: ./uninstall.sh $profile"
