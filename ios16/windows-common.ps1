# Shared helpers for the Windows launchers. Dot-source this; do not run it.
$ErrorActionPreference = "Stop"
$env:WSL_UTF8 = "1"

function Strip-WslText([string]$Text) {
    return ($Text -replace "`0", "").Trim()
}

function Get-Ios16WslDistro {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        Write-Error "WSL is not installed. In an Administrator terminal run: wsl --install -d Ubuntu`nReboot, open Ubuntu once and create its user, then run Setup again."
    }

    $rawList = & wsl.exe --list --quiet 2>&1 | Out-String
    $list = Strip-WslText $rawList
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($list)) {
        Write-Error "No WSL distro is installed. In an Administrator terminal run: wsl --install -d Ubuntu`nReboot, open Ubuntu once and create its user, then run Setup again."
    }

    $names = @(
        $list -split "`r?`n" |
            ForEach-Object { Strip-WslText $_ } |
            Where-Object { $_ -ne "" -and $_ -notmatch "^(docker-desktop|docker-desktop-data)$" }
    )
    if ($names.Count -eq 0) {
        Write-Error "No Ubuntu WSL distro is installed. In an Administrator terminal run: wsl --install -d Ubuntu"
    }

    $distro = $names | Where-Object { $_ -match "^Ubuntu" } | Select-Object -First 1
    if (-not $distro) { $distro = $names[0] }
    return $distro
}

function Get-Ios16WslPath([string]$WindowsPath) {
    # wsl.exe rewrites a Windows path before wslpath sees it, and wslpath then fails.
    # WSL2 mounts drives at /mnt/<letter>. Build that path here.
    $full = [System.IO.Path]::GetFullPath($WindowsPath)
    if ($full -notmatch '^([A-Za-z]):\\(.*)$') {
        Write-Error "Could not convert $WindowsPath into a WSL path. Use a folder on a drive, such as C:\Users\..."
    }
    $drive = $Matches[1].ToLowerInvariant()
    $rest = ($Matches[2] -replace '\\', '/').TrimEnd('/')
    if ([string]::IsNullOrEmpty($rest)) {
        return "/mnt/$drive"
    }
    return "/mnt/$drive/$rest"
}

function Resolve-Ios16Dir([string]$Start) {
    $candidates = @(
        $Start,
        (Join-Path $Start "ios16")
    )
    foreach ($dir in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $dir "wsl\setup.sh")) {
            return (Resolve-Path -LiteralPath $dir).Path
        }
    }
    Write-Error "Could not find wsl\setup.sh in $Start or in $Start\ios16. Unzip the whole repository and run Setup.bat from the ios16 folder."
}
