' Launches the twice-daily revenue sync clock with NO window (Ohad 2026-09-12:
' "does this stay open forever for the sync?" — it must stay running, but
' invisibly, like the other Startup helpers). Put a copy in shell:startup.
Dim sh: Set sh = CreateObject("WScript.Shell")
Dim repo: repo = sh.ExpandEnvironmentStrings("%EXPO_REPO%")
If repo = "%EXPO_REPO%" Or repo = "" Then repo = sh.ExpandEnvironmentStrings("%USERPROFILE%") & "\Desktop\expo-full"
sh.CurrentDirectory = repo
sh.Run """C:\Program Files\nodejs\node.exe"" scripts\sync-revenue-daemon.mjs", 0, False
