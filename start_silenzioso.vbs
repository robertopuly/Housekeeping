Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Progetti\Housekeeping"
WshShell.Run "node server.js", 0, False
