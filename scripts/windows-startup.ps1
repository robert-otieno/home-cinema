# Optional. Run this yourself only if you want automatic startup at sign-in.
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$node=(Get-Command node -ErrorAction Stop).Source
$action=New-ScheduledTaskAction -Execute $node -Argument 'apps/server/dist/index.js' -WorkingDirectory $projectRoot
$trigger=New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'Home Cinema' -Action $action -Trigger $trigger -Settings $settings -Description 'Local Home Cinema media server'
Write-Host 'Registered Home Cinema at sign-in. Remove with Unregister-ScheduledTask -TaskName "Home Cinema".'
