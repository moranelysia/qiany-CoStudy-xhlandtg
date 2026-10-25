' ============================================================
'  双击这个启动，完全不会闪出黑框。
'
'  为什么需要它：
'    run.cmd 是批处理，Windows 必须先开一个控制台来跑它 ——
'    所以哪怕里面用 start 立刻返回，屏幕上也还是会闪一下黑框。
'    VBScript 由 wscript.exe 执行，本身就没有控制台，所以一点都不会闪。
'
'  用法：双击即可。要传参数（比如 --smoke 看日志）请用 run.cmd。
' ============================================================
Option Explicit

Dim shell, fso, root, exePath, appDir

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = root & "\node_modules\electron\dist\electron.exe"
appDir = root & "\."

If Not fso.FileExists(exePath) Then
  MsgBox "找不到 Electron：" & vbCrLf & exePath & vbCrLf & vbCrLf & "先运行 dev.cmd build", 16, "伴学"
  WScript.Quit 1
End If

If Not fso.FileExists(root & "\out\main\index.js") Then
  MsgBox "还没构建：" & vbCrLf & root & "\out\main\index.js" & vbCrLf & vbCrLf & "先运行 dev.cmd build", 16, "伴学"
  WScript.Quit 1
End If

' 0 = 隐藏窗口（不闪黑框），False = 不等待退出
shell.Run """" & exePath & """ """ & appDir & """", 0, False
