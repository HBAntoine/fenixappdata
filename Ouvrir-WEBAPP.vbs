Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\Ouvrir-WEBAPP.bat" & Chr(34), 0, False
Set WshShell = Nothing
