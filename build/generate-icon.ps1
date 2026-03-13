# generate-icon.ps1 — generates build/icon.ico from a 256x256 drawn bitmap
# Run once from the build/ folder: powershell -ExecutionPolicy Bypass -File generate-icon.ps1

Add-Type -AssemblyName System.Drawing

$size = 256
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)

# Background gradient (dark purple/blue — matches app theme)
$brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.Point]::new(0, 0),
    [System.Drawing.Point]::new($size, $size),
    [System.Drawing.Color]::FromArgb(255, 18, 18, 31),   # --bg  #12121f
    [System.Drawing.Color]::FromArgb(255, 61, 43, 94)    # --purple #3d2b5e
)
$g.FillRectangle($brushBg, 0, 0, $size, $size)

# Rounded corners mask
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r    = 48   # corner radius
$path.AddArc(0,          0,          $r*2, $r*2, 180, 90)
$path.AddArc($size-$r*2, 0,          $r*2, $r*2, 270, 90)
$path.AddArc($size-$r*2, $size-$r*2, $r*2, $r*2,   0, 90)
$path.AddArc(0,          $size-$r*2, $r*2, $r*2,  90, 90)
$path.CloseFigure()
$g.SetClip($path)
$g.FillRectangle($brushBg, 0, 0, $size, $size)

# 4x4 pad grid (accent red)
$padSize  = 36
$gap      = 10
$cols     = 4
$rows     = 4
$totalW   = $cols * $padSize + ($cols-1) * $gap
$totalH   = $rows * $padSize + ($rows-1) * $gap
$startX   = ($size - $totalW) / 2
$startY   = ($size - $totalH) / 2

$brushPad = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 233, 69, 96))  # --accent #e94560
$brushDim = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(160, 233, 69, 96))

for ($row = 0; $row -lt $rows; $row++) {
    for ($col = 0; $col -lt $cols; $col++) {
        $x = $startX + $col * ($padSize + $gap)
        $y = $startY + $row * ($padSize + $gap)
        $brush = if (($row + $col) % 3 -eq 0) { $brushPad } else { $brushDim }
        # Rounded rect for each pad
        $pr = New-Object System.Drawing.Drawing2D.GraphicsPath
        $rr = 6
        $pr.AddArc($x,             $y,             $rr*2, $rr*2, 180, 90)
        $pr.AddArc($x+$padSize-$rr*2, $y,           $rr*2, $rr*2, 270, 90)
        $pr.AddArc($x+$padSize-$rr*2, $y+$padSize-$rr*2, $rr*2, $rr*2, 0, 90)
        $pr.AddArc($x,             $y+$padSize-$rr*2, $rr*2, $rr*2, 90, 90)
        $pr.CloseFigure()
        $g.FillPath($brush, $pr)
    }
}

$g.Dispose()

# Save as PNG first
$pngPath = Join-Path $PSScriptRoot "icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Save as ICO (Windows multi-size icon)
$icoPath = Join-Path $PSScriptRoot "icon.ico"
# Write ICO with 256x256 size
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()

# ICO file format: header (6 bytes) + entry (16 bytes) + PNG data
$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)

# ICONDIR header
$writer.Write([uint16]0)       # Reserved
$writer.Write([uint16]1)       # Type: 1 = ICO
$writer.Write([uint16]1)       # Count: 1 image

# ICONDIRENTRY (16 bytes)
$writer.Write([byte]0)         # Width (0 = 256)
$writer.Write([byte]0)         # Height (0 = 256)
$writer.Write([byte]0)         # ColorCount
$writer.Write([byte]0)         # Reserved
$writer.Write([uint16]1)       # Planes
$writer.Write([uint16]32)      # BitCount
$writer.Write([uint32]$pngBytes.Length)   # BytesInRes
$writer.Write([uint32]22)      # ImageOffset (6 + 16 = 22)

# PNG data
$writer.Write($pngBytes)
$writer.Flush()

[System.IO.File]::WriteAllBytes($icoPath, $icoStream.ToArray())
$bmp.Dispose()

Write-Host "Generated: $pngPath"
Write-Host "Generated: $icoPath"
Write-Host "NOTE: For macOS .icns, use electron-icon-builder or iconutil on macOS."
Write-Host "      The GitHub Actions macOS build will need build/icon.icns."
Write-Host "      If missing, electron-builder uses the default Electron icon."
