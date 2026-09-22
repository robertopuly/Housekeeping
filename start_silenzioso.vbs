Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Progetti\Housekeeping"
WshShell.Run """C:\Program Files\nodejs\node.exe"" server.js", 0, False
