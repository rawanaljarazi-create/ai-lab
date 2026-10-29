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

function Get-Ios16WslPath([string]$Distro, [string]$WindowsPath) {
    $wslPath = Strip-WslText ((& wsl.exe -d $Distro -- wslpath -a $WindowsPath) | Out-String)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($wslPath)) {
        Write-Error "Could not convert $WindowsPath into a WSL path."
    }
    return $wslPath
}
