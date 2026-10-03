<#
.SYNOPSIS
Removes dsh-peak-hour-tracker from a DeepSeek Harness web profile.

.DESCRIPTION
Deletes the Loader row this plugin installed from the profile's
cordis.patch.yml, waits for the running server to drop the entry, and only then
removes the copied package. That order matters: deleting the package directory
while the entry is still live leaves a stale entry in the host's composition
until the server restarts, so leave the wait in place.

Other rows, bundle layers, and files are untouched. Refresh the browser
afterwards.

.PARAMETER Profile
Profile to uninstall from. Defaults to `web`.

.PARAMETER DshHome
Harness home. Defaults to $env:DSH_HOME, else ~/.dsh.

.PARAMETER SettleSeconds
How long to let the live patch watcher recompose after the row is removed.
#>
[CmdletBinding()]
param(
	[string]$Profile = 'web',
	[string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }),
	[int]$SettleSeconds = 2
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-peak-hour-tracker'
$rowId = 'ui-peak-hours'
$source = $PSScriptRoot
$profileDir = Join-Path $DshHome "profiles\$Profile"
$profileManifest = Join-Path $profileDir 'package.json'
$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$helper = Join-Path $source 'scripts\patch-profile.mjs'

if (Test-Path $profileManifest) {
	& node $helper bundle $profileManifest $packageName
	if ($LASTEXITCODE -eq 0) {
		Write-Host "note: $packageName is a profile bundle layer here - remove it with 'dsh plugin --profile $Profile remove $packageName'"
	}
}

if (Test-Path $patchPath) {
	& node $helper remove $patchPath $rowId $packageName
	if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { throw "dsh: could not update $patchPath" }
}

if ($SettleSeconds -gt 0) {
	Write-Host "waiting ${SettleSeconds}s for the live patch watcher to drop the entry..."
	Start-Sleep -Seconds $SettleSeconds
}

$target = Join-Path $profileDir "node_modules\$packageName"
if (Test-Path $target) {
	Remove-Item -Path $target -Recurse -Force
	Write-Host "removed package -> $target"
}

Write-Host ''
Write-Host 'Done. Reload the DSH web page (Ctrl+R) to drop the tracker.'
