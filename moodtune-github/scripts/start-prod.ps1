# 生产守护启动（单端口 :8787，托管 dist）：进程崩溃后自动重启，连续 5 分钟内崩溃 10 次则退出
# 用法：先 npm run build，再 powershell -ExecutionPolicy Bypass -File scripts\start-prod.ps1
$fails = @()
while ($true) {
  Write-Host "[watchdog] starting bff $(Get-Date -Format 'HH:mm:ss')"
  $start = Get-Date
  node --use-system-ca server/bff.js
  $exit = $LASTEXITCODE
  $span = ((Get-Date) - $start).TotalSeconds
  Write-Host "[watchdog] bff exited code=$exit after ${span}s"
  if ($exit -eq 0) { break } # 正常退出（SIGINT/SIGTERM 已落盘）不重启
  # 存活超过 5 分钟视为偶发崩溃，重置失败计数
  if ($span -gt 300) { $fails = @() }
  $fails += $start
  if ($fails.Count -ge 10) { Write-Host "[watchdog] 连续崩溃 10 次，停止重启，请检查日志"; break }
  Start-Sleep -Seconds 3
}
