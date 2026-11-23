[Setup]
AppId={{6C94BAB2-487A-47F9-A797-AF1FEA1EBCE7}
AppName=冯如学媒协作工作台
AppVersion={#AppVersion}
DefaultDirName={localappdata}\FengruWorkbench
DefaultGroupName=冯如学媒协作工作台
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no
Compression=lzma2
SolidCompression=yes
OutputBaseFilename={#ArtifactName}
UninstallDisplayIcon={app}\runtime\node.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#PayloadDir}\server.mjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\drizzle\*.sql"; DestDir: "{app}\drizzle"; Flags: ignoreversion
Source: "{#PayloadDir}\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "{#PayloadDir}\runtime\LICENSE.txt"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "{#PayloadDir}\启动工作台.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\start-workbench.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\LICENSE-bcryptjs.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\release.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\使用说明.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\冯如学媒协作工作台"; Filename: "{app}\启动工作台.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\runtime\node.exe"
Name: "{group}\停止冯如学媒协作工作台"; Filename: "{app}\启动工作台.cmd"; Parameters: "-Stop"; WorkingDir: "{app}"

[Run]
Filename: "{app}\启动工作台.cmd"; Description: "启动冯如学媒协作工作台"; Flags: shellexec postinstall skipifsilent nowait
