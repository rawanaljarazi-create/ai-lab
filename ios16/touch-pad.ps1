# Click and drag on this window. TigerVNC is only the picture: a stream of
# mouse moves arrives at iOS late enough that the screen ignores them.
# One tap, or a short swipe, is sent when the button is released.
if ([Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
    Start-Process -FilePath powershell.exe -ArgumentList @(
        '-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
    )
    exit
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:client = $null
$script:reader = $null
$script:writer = $null

function Wait-Qmp {
    $deadline = (Get-Date).AddMinutes(8)
    while ((Get-Date) -lt $deadline) {
        $probe = New-Object System.Net.Sockets.TcpClient
        try {
            $probe.Connect('127.0.0.1', 4445)
            return $true
        } catch {
            Start-Sleep -Seconds 1
        } finally {
            $probe.Dispose()
        }
    }
    return $false
}

function Read-QmpResult {
    while ($true) {
        $line = $script:reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { throw 'The phone closed the input connection.' }
        if ($line.Contains('"return"') -or $line.Contains('"error"')) { return $line }
    }
}

function Send-Qmp([string]$json) {
    if ($null -eq $script:writer) { throw 'The phone is not connected.' }
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

function Connect-Phone {
    $script:client = New-Object System.Net.Sockets.TcpClient
    $script:client.Connect('127.0.0.1', 4445)
    $script:client.ReceiveTimeout = 3000
    $stream = $script:client.GetStream()
    $script:reader = New-Object System.IO.StreamReader($stream)
    $script:writer = New-Object System.IO.StreamWriter($stream)
    $script:writer.NewLine = "`n"
    $script:writer.AutoFlush = $true
    $null = $script:reader.ReadLine()
    Send-Qmp '{"execute":"qmp_capabilities"}'
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'iPhone touch'
$form.ClientSize = New-Object System.Drawing.Size(320, 700)
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 30)

$status = New-Object System.Windows.Forms.Label
$status.Dock = 'Top'
$status.Height = 44
$status.ForeColor = [System.Drawing.Color]::White
$status.TextAlign = 'MiddleCenter'
$status.Text = 'Waiting for the phone...'
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
$pad.BringToFront()

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
            $status.Text = 'Tap sent. Scroll the picture window if the phone is below the fold.'
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

if (Wait-Qmp) {
    try {
        Connect-Phone
        $status.Text = 'Click or drag here. The other window is the picture.'
    } catch {
        $status.Text = $_.Exception.Message
    }
} else {
    $status.Text = 'The phone input port never opened.'
}
$form.Add_FormClosed({
    if ($script:client) { $script:client.Dispose() }
})

[void]$form.ShowDialog()
