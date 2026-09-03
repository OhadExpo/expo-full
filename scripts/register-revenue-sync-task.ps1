# Registers the twice-daily revenue sync as a Windows scheduled task.
#
# Ohad: "make sure it gets updated (the revenue on expo) twice a day forever".
#
# Kept as its own script, and run by hand once, because creating a permanent
# OS-level task is a machine change that should be a deliberate act rather than
# a side effect of a build.
#
# It requires an INTERACTIVE session. The sync reads the two sheets through the
# signed-in debug Chrome, which needs a desktop: neither the Drive connector
# nor the mcp-gsheets service account can reach these files (the roster is
# owned by ohadexpo@gmail.com and has never been shared with the service
# account, and the connector has no permission scope to grant one). If the
# sheets are ever shared with mcp-gsheets@expo-music-495221.iam.gserviceaccount.com
# this can move to a headless job that needs no browser and no session.
#
# Undo with:  Unregister-ScheduledTask -TaskName 'EXPO Revenue Sync' -Confirm:$false
$ErrorActionPreference = 'Stop'
$name = 'EXPO Revenue Sync'
$repo = 'C:\Users\Administrator\Desktop\expo-full'

try { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction Stop } catch {}

$act = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $repo + '\scripts\sync-revenue.ps1"') `
  -WorkingDirectory $repo
$t1 = New-ScheduledTaskTrigger -Daily -At 07:30
$t2 = New-ScheduledTaskTrigger -Daily -At 19:30
# StartWhenAvailable so a run missed while the machine was off still happens;
# IgnoreNew so a slow run is never overlapped by the next trigger.
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew `
  -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName $name -Action $act -Trigger $t1, $t2 -Settings $set `
  -Description 'Pulls רשימת מתאמנים and ניהול פיננסי and upserts EXPO revenue. Needs an interactive session: it reads the sheets through the signed-in debug Chrome.' | Out-Null

Get-ScheduledTask -TaskName $name | Select-Object TaskName, State
(Get-ScheduledTask -TaskName $name).Triggers | Select-Object StartBoundary
Write-Output 'Registered. Run it once now with: Start-ScheduledTask -TaskName "EXPO Revenue Sync"'
