@echo off
rem Launched from the user's Startup folder: keeps the twice-daily revenue sync
rem clock running (scripts/sync-revenue-daemon.mjs). Minimised, never a dialog.
cd /d "C:\Users\Administrator\Desktop\expo-full"
start "EXPO revenue sync clock" /min "C:\Program Files\nodejs\node.exe" scripts\sync-revenue-daemon.mjs
