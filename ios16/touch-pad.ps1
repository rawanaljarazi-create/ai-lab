# Click and drag on this window. The picture inside it is the phone's screen,
# snapped a few times a second from QEMU, so what you tap is what the phone
# shows. TigerVNC is a bigger copy of the same picture but does not take touch.
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
$script:pngPath = '\\wsl$\Ubuntu\tmp\ios16-mirror.bmp'
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

function Send-KeyState([string]$name, [bool]$down) {
    if ($name -notin @('h', 'l', 'up', 'down')) { throw 'Unknown key.' }
    $flag = $(if ($down) { 'true' } else { 'false' })
    # Built without expanding the whole document as one quoted string, so a
    # key name cannot break the JSON.
    $json = '{"execute":"input-send-event","arguments":{"events":[{"type":"key","data":{"down":' + $flag + ',"key":{"type":"qcode","data":"' + $name + '"}}}]}}'
    Send-Qmp $json
}

# A finger that wobbles a few dozen pixels is still a tap. Turning that into
# a six-step swipe keeps the contact down for several round-trips through
# WSL, and SpringBoard reads it as a hold or drops the click.
$script:tapSlopPx = 36
$script:minTapMs = 110
$script:minKeyMs = 220
$script:fingerDown = $false
$script:dragging = $false
$script:press = $null
$script:movePoint = $null
$script:upDue = $null
$script:upPoint = $null
$script:downAt = [datetime]::MinValue
$script:keyHeld = $null
$script:keyDownAt = [datetime]::MinValue
$script:keyUpDue = $false
$script:keyLabel = @{ h = 'Home'; l = 'Power'; up = 'Vol +'; down = 'Vol -' }

function Send-UpNow {
    if ($null -eq $script:upPoint) { return }
    $point = $script:upPoint
    Send-Pointer $point.X $point.Y $false
    $script:upDue = $null
    $script:upPoint = $null
    $script:movePoint = $null
}

function Flush-Input {
    $now = Get-Date
    if ($null -ne $script:upDue -and $now -ge $script:upDue) {
        Send-UpNow
    }
    if ($script:keyUpDue -and $script:keyHeld -and (($now - $script:keyDownAt).TotalMilliseconds -ge $script:minKeyMs)) {
        $name = $script:keyHeld
        $script:keyHeld = $null
        $script:keyUpDue = $false
        Send-KeyState $name $false
        $status.Text = "$($script:keyLabel[$name]) sent."
    }
    if ($script:fingerDown -and $script:dragging -and $null -ne $script:movePoint -and $null -eq $script:upDue) {
        $point = $script:movePoint
        $script:movePoint = $null
        Send-Pointer $point.X $point.Y $null
    }
}

function Image-Fraction($e) {
    $cw = [double][Math]::Max(1, $pb.ClientSize.Width)
    $ch = [double][Math]::Max(1, $pb.ClientSize.Height)
    $ox = 0.0
    $oy = 0.0
    $dw = $cw
    $dh = $ch
    if ($null -ne $pb.Image -and $pb.Image.Width -gt 0 -and $pb.Image.Height -gt 0) {
        $scale = [Math]::Min($cw / $pb.Image.Width, $ch / $pb.Image.Height)
        $dw = $pb.Image.Width * $scale
        $dh = $pb.Image.Height * $scale
        $ox = ($cw - $dw) / 2
        $oy = ($ch - $dh) / 2
    }
    $x = $e.X - $ox
    $y = $e.Y - $oy
    $inside = ($x -ge 0 -and $y -ge 0 -and $x -lt $dw -and $y -lt $dh)
    if (-not $inside) { return $null }
    return @{ X = $x / $dw; Y = $y / $dh; PX = [int]$e.X; PY = [int]$e.Y }
}

function Begin-Finger($point) {
    # Finish the previous contact before a new one, including a lift that
    # was still waiting out the minimum tap time.
    if ($script:fingerDown) { End-Finger $script:press }
    Send-UpNow
    if ($script:keyHeld) {
        Send-KeyState $script:keyHeld $false
        $script:keyHeld = $null
        $script:keyUpDue = $false
    }
    try {
        # Position and button-down travel together, so the click is one
        # round-trip instead of two.
        Send-Pointer $point.X $point.Y $true
    } catch {
        try { Send-Pointer $point.X $point.Y $false } catch {}
        $script:fingerDown = $false
        throw
    }
    $script:fingerDown = $true
    $script:dragging = $false
    $script:press = $point
    $script:movePoint = $null
    $script:upDue = $null
    $script:upPoint = $null
    $script:downAt = Get-Date
}

function Note-Finger($point) {
    if (-not $script:fingerDown -or $null -eq $script:press) { return }
    $dx = $point.PX - $script:press.PX
    $dy = $point.PY - $script:press.PY
    if (-not $script:dragging) {
        if (($dx * $dx + $dy * $dy) -lt ($script:tapSlopPx * $script:tapSlopPx)) { return }
        $script:dragging = $true
    }
    $script:movePoint = $point
}

function End-Finger($point) {
    if (-not $script:fingerDown) { return }
    $script:fingerDown = $false
    if ($null -eq $point) { $point = $script:movePoint }
    $script:movePoint = $null
    # A shaky click stays on the icon that was pressed. A real drag ends
    # where the finger lifted.
    if (-not $script:dragging -or $null -eq $point) { $point = $script:press }
    $script:upPoint = $point
    $wait = $script:minTapMs - ((Get-Date) - $script:downAt).TotalMilliseconds
    if ($wait -le 0) {
        Send-UpNow
    } else {
        $script:upDue = (Get-Date).AddMilliseconds($wait)
    }
}

function Start-HardwareKey([string]$name) {
    if ($script:fingerDown) { End-Finger $script:press }
    Send-UpNow
    Flush-Input
    if ($script:keyHeld) { return }
    Send-KeyState $name $true
    $script:keyHeld = $name
    $script:keyDownAt = Get-Date
    $script:keyUpDue = $false
}

function Request-KeyUp {
    if ($script:keyHeld) { $script:keyUpDue = $true }
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

function Test-Ready {
    if ($script:step -ne 'ready' -or $null -eq $script:writer) {
        $status.Text = 'The phone is not connected yet.'
        return $false
    }
    return $true
}

$pb.Add_MouseDown({
    param($sender, $e)
    if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    $point = Image-Fraction $e
    if ($null -eq $point) { return }
    if (-not (Test-Ready)) { return }
    $pb.Capture = $true
    try { Begin-Finger $point } catch { $status.Text = $_.Exception.Message }
})
$pb.Add_MouseMove({
    param($sender, $e)
    if (-not $script:fingerDown) { return }
    $point = Image-Fraction $e
    if ($null -eq $point) { return }
    Note-Finger $point
})
$pb.Add_MouseUp({
    param($sender, $e)
    if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
    if (-not $script:fingerDown) { $pb.Capture = $false; return }
    $point = Image-Fraction $e
    try { End-Finger $point } catch { $status.Text = $_.Exception.Message }
    $pb.Capture = $false
})
$pb.Add_MouseCaptureChanged({
    if ($pb.Capture -or -not $script:fingerDown) { return }
    try { End-Finger $null } catch { $status.Text = $_.Exception.Message }
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
    # Each button keeps its own key. Home is h, not whichever key the
    # loop variable held when a shared closure ran.
    $button.Tag = $item.Key
    $button.Add_MouseDown({
        param($sender, $e)
        if ($e.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
        $this.Capture = $true
        $name = [string]$this.Tag
        $label = [string]$this.Text
        if (-not (Test-Ready)) { return }
        try {
            Start-HardwareKey $name
            $status.Text = "$label held."
        } catch { $status.Text = $_.Exception.Message }
    })
    $button.Add_MouseUp({
        param($sender, $e)
        $this.Capture = $false
        Request-KeyUp
    })
    $button.Add_MouseCaptureChanged({
        if (-not $this.Capture) { Request-KeyUp }
    })
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
        if ($script:step -eq 'ready' -and $status.Text -like 'Waiting*') {
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
$engine.Interval = 40
$engine.Add_Tick({
    try { Flush-Input } catch { $status.Text = $_.Exception.Message }
    Show-MirrorFrame
    if ($null -eq $script:mirrorProc -or $script:mirrorProc.HasExited) {
        if ((Test-Path -LiteralPath $script:mirrorScript) -and (Get-Date) -gt $script:mirrorNext) {
            $script:mirrorProc = Start-Process -FilePath powershell.exe -ArgumentList @(
                '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script:mirrorScript, '-OwnerId', "$PID"
            ) -WindowStyle Hidden -PassThru
            $script:mirrorNext = (Get-Date).AddSeconds(15)
        }
    }
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

# Frame grabber: one hidden helper. It exits on its own when this pad closes,
# and the pad's tick brings it back if it ever dies (VM restart, reboot).
$script:mirrorScript = Join-Path $PSScriptRoot 'touch-mirror.ps1'
$script:mirrorNext = (Get-Date).AddSeconds(5)
if (Test-Path -LiteralPath $script:mirrorScript) {
    $script:mirrorProc = Start-Process -FilePath powershell.exe -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $script:mirrorScript, '-OwnerId', "$PID"
    ) -WindowStyle Hidden -PassThru
}

$form.Add_FormClosed({
    # Stop the flag first: the grabber polls it and quits by itself, so no
    # orphan daemon is left running inside the WSL VM.
    & wsl.exe -d Ubuntu -- rm -f /tmp/ios16-mirror.run 2>$null
    if ($script:client) { $script:client.Dispose() }
    if ($script:mirrorProc) {
        Stop-Process -Id $script:mirrorProc.Id -Force -ErrorAction SilentlyContinue
    }
})

$engine.Start()
[void]$form.ShowDialog()
