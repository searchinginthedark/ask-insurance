# register-local-verify.ps1 - schedule the weekly local verifier run (tools/local_verify.py).
#
# Modelled on equity-loop's register-catalyst-task.ps1 (Interactive logon, wscript + .vbs to
# hide consoles, IgnoreNew, battery flags).
#
# Trigger: Mondays 10:30 local (Singapore), after the GitHub Link check at 09:17 SGT; the laptop
# is reliably on by 10:30 (user, 2026-09-24). StartWhenAvailable catches up a run missed while
# it slept. A failure is reported by memory/tools/watchdog/local_watch.py, which must list this
# task name in TASKS.

$ErrorActionPreference = 'Stop'

$TaskName = 'askinsurance-verify'
$Dir      = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root     = Split-Path -Parent $Dir
$Vbs      = Join-Path $Dir 'local_verify.vbs'
$Py       = Join-Path $Dir 'local_verify.py'
$WScript  = Join-Path $env:SystemRoot 'System32\wscript.exe'
$Python   = (Get-Command python -ErrorAction Stop).Source

foreach ($p in @($Vbs, $Py, $WScript, $Python)) {
  if (-not (Test-Path $p)) { Write-Error "missing $p"; exit 1 }
}
if ($Python -like '*WindowsApps*') {
  Write-Error "python resolves to the Store alias ($Python), which a scheduled task cannot run"; exit 1
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  Write-Output "removing existing task '$TaskName'"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $WScript -Argument "`"$Vbs`" `"$Python`"" -WorkingDirectory $Root

$weekly = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '10:30AM'

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $weekly `
  -Settings $settings -Principal $principal `
  -Description 'Ask Insurance: re-verify every guide item and Compare cell against its source from Singapore (AIA, Manulife and MOE refuse GitHub). Writes only research/raw/.' | Out-Null

# Read it back rather than assume it.
$t = Get-ScheduledTask -TaskName $TaskName
Write-Output "registered: $($t.TaskName)  state: $($t.State)"
Write-Output "action:     $($t.Actions[0].Execute) $($t.Actions[0].Arguments)"
Write-Output "logon:      $($t.Principal.LogonType)  runlevel: $($t.Principal.RunLevel)"
foreach ($tr in $t.Triggers) {
  Write-Output "trigger:    $($tr.CimClass.CimClassName)  start=$($tr.StartBoundary)  days=$($tr.DaysOfWeek)"
}
Write-Output "on battery: $(-not $t.Settings.DisallowStartIfOnBatteries)  catch-up: $($t.Settings.StartWhenAvailable)  overlap: $($t.Settings.MultipleInstances)"
Write-Output "next run:   $((Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime)"
