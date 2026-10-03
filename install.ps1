<#
.SYNOPSIS
Installs dsh-peak-hour-tracker into a DeepSeek Harness web profile.

.DESCRIPTION
The no-pnpm route: copies this package into the profile's node_modules and adds
one Loader row to the profile's cordis.patch.yml. The web profile ships with
`patchReload: live`, so the row is composed while the server keeps running;
refresh the browser once afterwards and the tracker appears.

If the package was already installed the standard way (`dsh plugin --profile
web add ...`, which adds it as a profile bundle layer), this script detects that
and leaves the Loader row alone — writing it too would insert a duplicate entry.

Idempotent: re-running refreshes the copied files and never duplicates the row.

.PARAMETER Profile
Profile to install into. Defaults to `web`.

.PARAMETER DshHome
Harness home. Defaults to $env:DSH_HOME, else ~/.dsh.

.EXAMPLE
pwsh -File install.ps1
pwsh -File install.ps1 -Profile web
#>
[CmdletBinding()]
param(
	[string]$Profile = 'web',
	[string]$DshHome = $(if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' })
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-peak-hour-tracker'
$rowId = 'ui-peak-hours'
$source = $PSScriptRoot
$profileDir = Join-Path $DshHome "profiles\$Profile"
$profileManifest = Join-Path $profileDir 'package.json'

if (-not (Test-Path $profileManifest)) {
	throw "dsh: profile '$Profile' not found at $profileDir (expected a package.json there)"
}

$target = Join-Path $profileDir "node_modules\$packageName"
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source 'package.json') -Destination $target -Force
foreach ($extra in @('README.md', 'LICENSE')) {
	$from = Join-Path $source $extra
	if (Test-Path $from) { Copy-Item -Path $from -Destination $target -Force }
}
Copy-Item -Path (Join-Path $source 'lib') -Destination $target -Recurse -Force
Write-Host "installed package -> $target"

$patchPath = Join-Path $profileDir 'cordis.patch.yml'
if (-not (Test-Path $patchPath)) { Set-Content -Path $patchPath -Value "[]`n" -Encoding utf8 -NoNewline }

$helper = Join-Path $source 'scripts\patch-profile.mjs'
& node $helper bundle $profileManifest $packageName
if ($LASTEXITCODE -eq 0) {
	Write-Host "already a profile bundle layer - leaving $patchPath alone"
} else {
	& node $helper add $patchPath $rowId $packageName
	if ($LASTEXITCODE -ne 0) { throw "dsh: could not update $patchPath" }
}

Write-Host ''
Write-Host 'Done. Reload the DSH web page (Ctrl+R) to mount the tracker.'
Write-Host 'To remove it again: pwsh -File uninstall.ps1'
