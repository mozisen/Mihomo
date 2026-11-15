# 試接主控的重置日期與在線 IP

## 背景
帳戶頁的「重置日期」「在線 IP」一直顯示 —。妙妙屋X 用戶面板讀這兩項的來源：
- 方案指派（queryKey `user-package-assignments`）：`reset_day`、`is_reset`、`id`
- 即時流量（queryKey `user-traffic-live`）：`ips: [{ ip, region, isp, nodes[], conns }]`

官方前端把路徑換成帶密鑰的雜湊，真實路徑未知，只能猜測。

## 需求
- 每次同步時經加密通道依序嘗試候選路徑：
  - 方案指派：`/user/package-assignments`、`/user/packages`
  - 即時流量：`/user/traffic/live`、`/user/traffic-live`
- 404/405 換下一個；全部失敗就本次啟動不再嘗試，欄位維持 —。
- 任何錯誤（含 401）都不能影響登入狀態與訂閱同步。
- 命中的路徑記在記憶體，之後只打那一個；日誌記錄命中或失敗，方便回報。
- 重置日：優先取與目前套餐 `assignment_id` 相同的指派，否則取第一個 `is_reset` 且 `reset_day` 1–31 的。

## 驗收
- 單元測試覆蓋：命中、回退到第二個候選、全部 404 後不再請求、401 不登出、回應格式（陣列或 `{assignments}`）。
- format:check / lint:check / typecheck / test 全部通過。
