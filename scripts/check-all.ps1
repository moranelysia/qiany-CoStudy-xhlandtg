# check-all.ps1 - run every self-test mode in sequence.
#
# Why this exists:
#   These 10 modes cover card store, learn session, mistakes, spacing,
#   memory scoring, compression, AI card writing, age guard, UI wiring,
#   startup smoke and window buttons. Run it after every change.
$ErrorActionPreference = 'Stop'
# 子进程输出是 UTF-8，控制台默认按本地代码页解码会乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $exe)) { Write-Host "electron.exe not found: $exe" -ForegroundColor Red; exit 1 }

$modes = @(
  '--selftest',
  '--learntest',
  '--mistaketest',
  '--pointtest',
  '--memtest',
  '--compresstest',
  '--llmtest',
  '--safetest',
  '--uitest',
  '--smoke',
  '--wintest'
)

$env:ELECTRON_RUN_AS_NODE = $null
$fail = 0
$started = Get-Date

foreach ($mode in $modes) {
  Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $out = Join-Path $env:TEMP ("costudy" + $mode + ".out")
  $err = Join-Path $env:TEMP ("costudy" + $mode + ".err")
  Remove-Item $out, $err -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath $exe -ArgumentList "`".\out\main\index.js`"", $mode -WorkingDirectory $root -RedirectStandardOutput $out -RedirectStandardError $err -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -eq 0) {
    Write-Host ("  {0,-16} PASS" -f $mode) -ForegroundColor Green
  } else {
    $fail = $fail + 1
    Write-Host ("  {0,-16} FAIL" -f $mode) -ForegroundColor Red
  }
  # 子进程输出是 UTF-8，必须显式按 UTF-8 读，否则中文全是乱码
  Get-Content $out -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ -match 'result|prompt len' } | ForEach-Object { Write-Host "    $_" }
  Start-Sleep -Milliseconds 300
}

$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host ("  failed {0} / {1}    {2}s" -f $fail, $modes.Count, $elapsed)
if ($fail -eq 0) { exit 0 } else { exit 1 }