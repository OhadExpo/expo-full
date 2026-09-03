# Wrapper for the scheduled twice-daily revenue sync.
#
# Task Scheduler needs a fixed working directory and its own environment; the
# node script does the work. PYTHONUTF8 is set here because the sheets are
# Hebrew and the parser writes UTF-8 JSON.
$ErrorActionPreference = 'Stop'
Set-Location 'C:\Users\Administrator\Desktop\expo-full'
$env:PYTHONUTF8 = '1'
& node 'scripts\sync-revenue.mjs'
exit $LASTEXITCODE
