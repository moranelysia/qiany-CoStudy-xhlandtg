' ============================================================
'  Double-click to launch with NO console window at all.
'
'  Why this exists:
'    run.cmd is a batch file, so Windows must open a console to run it --
'    even if it calls `start` and returns at once, the black window still
'    flashes. This script is run by wscript.exe, which has no console at all.
'
'  NOTE: keep this file ASCII-only. wscript reads .vbs in the system ANSI
'  code page; non-ASCII text here gets mangled into a syntax error.
' ============================================================
Option Explicit

Dim shell, fso, root, exePath, appDir, entry

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = root & "\node_modules\electron\dist\electron.exe"
appDir = root & "."
entry = root & "\out\main\index.js"

If Not fso.FileExists(entry) Then
  MsgBox "Not built yet:" & vbCrLf & entry & vbCrLf & vbCrLf & "Run:  dev.cmd build", 16, "Costudy"
  WScript.Quit 1
End If

If Not fso.FileExists(exePath) Then
  MsgBox "Electron not found:" & vbCrLf & exePath, 16, "Costudy"
  WScript.Quit 1
End If

' 0 = hidden, False = do not wait
shell.Run """" & exePath & """ """ & appDir & """", 0, False
