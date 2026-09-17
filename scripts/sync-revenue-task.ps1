# Registers (or re-registers) the Windows scheduled task that runs the revenue
# sync twice a day - the schedule the sync script was written for and never
# had. Ohad 2026-09-12: "the dashboard is supposed to autonomously draw twice
# a day an update from here [the roster sheet]".
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sync-revenue-task.ps1
#
# Interactive logon (the sync drives the signed-in debug Chrome, which needs a
# desktop); StartWhenAvailable catches a missed run after the PC was asleep.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Administrator\Desktop\expo-full'
$node = (Get-Command node).Source
$name = 'EXPO revenue sync (twice daily)'
$action = New-ScheduledTaskAction -Execute $node -Argument 'scripts/sync-revenue.mjs' -WorkingDirectory $repo
$t1 = New-ScheduledTaskTrigger -Daily -At 09:00
$t2 = New-ScheduledTaskTrigger -Daily -At 21:00
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($t1, $t2) -Settings $settings -Principal $principal -Description 'Pulls the roster + finance sheets into EXPO (scripts/sync-revenue.mjs). Log: audit-out/sheets/sync.log' | Out-Null
$task = Get-ScheduledTask -TaskName $name
$info = Get-ScheduledTaskInfo -TaskName $name
"registered: $($task.TaskName)  state=$($task.State)  next=$($info.NextRunTime)"
