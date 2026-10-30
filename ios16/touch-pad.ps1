# Click and drag on this window. The picture inside it is the phone's screen,
# snapped every couple of seconds from QEMU's monitor port, so what you tap is
# what the phone shows. TigerVNC is a bigger, faster copy of the same picture
# but does not take touch.
#
# The window shows immediately and the connection is retried forever: if the
# input port is busy or the VM restarts, this window reports it in the status
# line and reconnects by itself.
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    Start-Process -FilePath powershell.exe -ArgumentList @(
        '-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
    )
    exit
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:client = $null
$script:stream = $null
$script:reader = $null
$script:writer = $null
$script:pngPath = '\\wsl$\Ubuntu\tmp\ios16-mirror.png'
$script:pngStamp = 0

function Read-QmpResult {
    while ($true) {
        $line = $script:reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { throw 'The phone closed the input connection.' }
        if ($line.Contains('"return"') -or $line.Contains('"error"')) { return $line }
    }
}

function Send-Qmp([string]$json) {
    if ($null -eq $script:writer) { throw 'The phone is not connected yet.' }
    $script:writer.WriteLine($json)
    $reply = Read-QmpResult
    if ($reply.Contains('"error"')) { throw 'The phone rejected an input event.' }
}

function Send-Pointer([double]$x, [double]$y, $down) {
    if ($x -lt 0) { $x = 0 } elseif ($x -gt 1) { $x = 1 }
    if ($y -lt 0) { $y = 0 } elseif ($y -gt 1) { $y = 1 }
    $xi = [int][Math]::Round($x * 32767)
    $yi = [int][Math]::Round($y * 32767)
    $events = @(
        "{`"type`":`"abs`",`"data`":{`"axis`":`"x`",`"value`":$xi}}",
        "{`"type`":`"abs`",`"data`":{`"axis`":`"y`",`"value`":$yi}}"
    )
    if ($null -ne $down) {
        $flag = $(if ($down) { 'true' } else { 'false' })
        $events += "{`"type`":`"btn`",`"data`":{`"button`":`"left`",`"down`":$flag}}"
    }
    Send-Qmp "{`"execute`":`"input-send-event`",`"arguments`":{`"events`":[$(($events -join ','))]}}"
}

function Send-Tap([double]$x, [double]$y) {
    Send-Pointer $x $y $null
    Send-Pointer $x $y $true
    Start-Sleep -Milliseconds 60
    Send-Pointer $x $y $false
}

function Send-Swipe([double]$x0, [double]$y0, [double]$x1, [double]$y1) {
    Send-Pointer $x0 $y0 $null
    Send-Pointer $x0 $y0 $true
    foreach ($i in 1..6) {
        Start-Sleep -Milliseconds 28
        Send-Pointer ($x0 + ($x1 - $x0) * $i / 6) ($y0 + ($y1 - $y0) * $i / 6) $null
    }
    Start-Sleep -Milliseconds 20
    Send-Pointer $x1 $y1 $false
}

function Send-Key([string]$name) {
    foreach ($down in @('true', 'false')) {
        Send-Qmp "{`"execute`":`"input-send-event`",`"arguments`":{`"events`":[{`"type`":`"key`",`"data`":{`"down`":$down,`"key`":{`"type`":`"qcode`",`"data`":`"$name`"}}}]}}"
        if ($down -eq 'true') { Start-Sleep -Milliseconds 80 }
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'iPhone touch'
$form.ClientSize = New-Object System.Drawing.Size(320, 780)
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 30)

$status = New-Object System.Windows.Forms.Label
$status.Dock = 'Top'
$status.Height = 44
$status.ForeColor = [System.Drawing.Color]::White
$status.TextAlign = 'MiddleCenter'
$status.Text = 'Starting...'
$form.Controls.Add($status)

$buttons = New-Object System.Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Bottom'
$buttons.Height = 44
$buttons.Padding = New-Object System.Windows.Forms.Padding(8, 6, 8, 6)
$form.Controls.Add($buttons)

$pad = New-Object System.Windows.Forms.Panel
$pad.Dock = 'Fill'
$pad.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 12)
$pad.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($pad)

# The mirror picture fills the touch surface. 320x692 matches the phone
# screen's shape (1125x2436), so a click's fractional position on the picture
# is its fractional position on the phone - tap exactly where you see things.
$pb = New-Object System.Windows.Forms.PictureBox
$pb.Dock = 'Fill'
$pb.SizeMode = 'Zoom'
$pb.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 12)
$pb.Cursor = [System.Windows.Forms.Cursors]::Hand
$pad.Controls.Add($pb)

$script:origin = $null
function Point-Fraction($e) {
    $w = [Math]::Max(1, $pad.ClientSize.Width)
    $h = [Math]::Max(1, $pad.ClientSize.Height)
    return @{ X = $e.X / $w; Y = $e.Y / $h }
}

$pad.Add_MouseDown({
    param($sender, $e)
    $script:origin = Point-Fraction $e
})
$pb.Add_MouseDown({
    param($sender, $e)
    $script:origin = Point-Fraction $e
})

$pad.Add_MouseUp({
    param($sender, $e)
    if ($null -eq $script:origin) { return }
    $end = Point-Fraction $e
    $start = $script:origin
    $script:origin = $null
    $dx = ($end.X - $start.X) * $pad.ClientSize.Width
    $dy = ($end.Y - $start.Y) * $pad.ClientSize.Height
    try {
        if (($dx * $dx + $dy * $dy) -lt 64) {
            Send-Tap $end.X $end.Y
            $status.Text = 'Tap sent.'
        } else {
            Send-Swipe $start.X $start.Y $end.X $end.Y
            $status.Text = 'Swipe sent.'
        }
    } catch {
        $status.Text = $_.Exception.Message
    }
})
$pb.Add_MouseUp({
    param($sender, $e)
    if ($null -eq $script:origin) { return }
    $end = Point-Fraction $e
    $start = $script:origin
    $script:origin = $null
    $dx = ($end.X - $start.X) * $pad.ClientSize.Width
    $dy = ($end.Y - $start.Y) * $pad.ClientSize.Height
    try {
        if (($dx * $dx + $dy * $dy) -lt 64) {
            Send-Tap $end.X $end.Y
            $status.Text = 'Tap sent.'
        } else {
            Send-Swipe $start.X $start.Y $end.X $end.Y
            $status.Text = 'Swipe sent.'
        }
    } catch {
        $status.Text = $_.Exception.Message
    }
})

foreach ($item in @(
    @{ Label = 'Home'; Key = 'h' },
    @{ Label = 'Power'; Key = 'l' },
    @{ Label = 'Vol +'; Key = 'up' },
    @{ Label = 'Vol -'; Key = 'down' }
)) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $item.Label
    $button.Width = 70
    $button.Height = 28
    $keyName = $item.Key
    $keyLabel = $item.Label
    $button.Add_Click({
        try {
            Send-Key $keyName
            $status.Text = "$keyLabel sent."
        } catch {
            $status.Text = $_.Exception.Message
        }
    }.GetNewClosure())
    $buttons.Controls.Add($button)
}

# --- mirror: swap in a frame whenever the grabber wrote a newer picture ---
function Show-MirrorFrame {
    if (-not (Test-Path -LiteralPath $script:pngPath)) { return }
    $stamp = (Get-Item -LiteralPath $script:pngPath).LastWriteTimeUtc.Ticks
    if ($stamp -le $script:pngStamp) { return }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($script:pngPath)
        $ms = New-Object System.IO.MemoryStream (,$bytes)
        $bmp = New-Object System.Drawing.Bitmap($ms)
        $ms.Dispose()
        $old = $pb.Image
        $pb.Image = $bmp
        if ($old) { $old.Dispose() }
        $script:pngStamp = $stamp
        if ($script:step -eq 'ready') {
            $status.Text = 'Drag or tap the picture. TigerVNC is a bigger view.'
        }
    } catch {
        # a torn copy or a hiccup; the grabber writes the next frame anyway
    }
}

# --- connection engine: driven by a timer, so the window is never frozen ---
$script:step = 'idle'
$script:since = Get-Date

function Retry-Later([string]$message) {
    try { if ($script:client) { $script:client.Close() } } catch {}
    $script:client = $null
    $script:stream = $null
    $script:reader = $null
    $script:writer = $null
    $script:step = 'idle'
    $status.Text = $message
}

function Phone-Gone {
    # The VM closed the connection (still running? then this is a busy port).
    $lost = $false
    try {
        $sock = $script:client.Client
        if ($sock.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and (-not $script:stream.DataAvailable)) {
            $lost = $true
        }
    } catch {
        $lost = $true
    }
    return $lost
}

function Expired([int]$seconds) {
    return (((Get-Date) - $script:since).TotalSeconds -gt $seconds)
}

$engine = New-Object System.Windows.Forms.Timer
$engine.Interval = 500
$engine.Add_Tick({
    Show-MirrorFrame
    switch ($script:step) {
        'idle' {
            $status.Text = 'Waiting for the phone...'
            $script:client = New-Object System.Net.Sockets.TcpClient
            try {
                $script:client.Connect('127.0.0.1', 4445)
                $script:client.ReceiveTimeout = 3000
                $script:stream = $script:client.GetStream()
                $script:reader = New-Object System.IO.StreamReader($script:stream)
                $script:writer = New-Object System.IO.StreamWriter($script:stream)
                $script:writer.NewLine = "`n"
                $script:writer.AutoFlush = $true
                $script:step = 'greeting'
                $script:since = Get-Date
            } catch {
                $script:client.Dispose()
                $script:client = $null
                $script:step = 'idle'   # the VM is not up yet; the tick retries
            }
        }
        'greeting' {
            if (Phone-Gone -or (Expired 5)) {
                Retry-Later 'The input port is busy, retrying...'
                return
            }
            try {
                while ($script:stream.DataAvailable) {
                    $line = $script:reader.ReadLine()
                    if ([string]::IsNullOrEmpty($line)) { Retry-Later 'The phone closed the connection.'; return }
                    if ($line.Contains('"QMP"')) {
                        $script:writer.WriteLine('{"execute":"qmp_capabilities"}')
                        $script:step = 'capabilities'
                        $script:since = Get-Date
                    }
                }
            } catch { Retry-Later 'The input port is busy, retrying...' }
        }
        'capabilities' {
            if (Phone-Gone -or (Expired 5)) {
                Retry-Later 'The input port is busy, retrying...'
                return
            }
            try {
                while ($script:stream.DataAvailable) {
                    $line = $script:reader.ReadLine()
                    if ([string]::IsNullOrEmpty($line)) { Retry-Later 'The phone closed the connection.'; return }
                    if ($line.Contains('"return"')) {
                        $script:step = 'ready'
                        $status.Text = 'Drag or tap the picture. TigerVNC is a bigger view.'
                    } elseif ($line.Contains('"error"')) {
                        Retry-Later 'The phone refused the controller.'
                    }
                }
            } catch { Retry-Later 'The input port is busy, retrying...' }
        }
        'ready' {
            if (Phone-Gone) {
                Retry-Later 'The phone stopped. Waiting for it to come back...'
            }
        }
    }
})

# Frame grabber: one hidden helper that snapshots the screen every 2 seconds.
# It exits by itself when this pad closes (its OwnerId dies).
$mirror = Join-Path $PSScriptRoot 'touch-mirror.ps1'
$script:mirrorProc = $null
if (Test-Path -LiteralPath $mirror) {
    $script:mirrorProc = Start-Process -FilePath powershell.exe -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $mirror, '-OwnerId', "$PID"
    ) -WindowStyle Hidden -PassThru
}

$form.Add_FormClosed({
    if ($script:client) { $script:client.Dispose() }
    if ($script:mirrorProc) {
        Stop-Process -Id $script:mirrorProc.Id -Force -ErrorAction SilentlyContinue
    }
})

$engine.Start()
[void]$form.ShowDialog()
