' local_verify.vbs - run tools/local_verify.py with no console window.
'
' Same pattern as memory/tools/fleet/sweep.vbs and equity-loop's catalyst_daily.vbs: an
' Interactive scheduled task that runs python.exe directly flashes a console. Window style 0,
' and wait, so the task's Last Run Result is local_verify.py's own exit code, which
' memory/tools/watchdog/local_watch.py reads.
'
' Argument 0 is the python.exe register-local-verify.ps1 resolved at registration.

Option Explicit

Dim fso, sh, scriptDir, target, py

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
target    = fso.BuildPath(scriptDir, "local_verify.py")

If Not fso.FileExists(target) Then WScript.Quit 3
py = "python"
If WScript.Arguments.Count > 0 Then py = WScript.Arguments(0)

WScript.Quit sh.Run("""" & py & """ """ & target & """", 0, True)
