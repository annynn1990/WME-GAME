# WME-GAME｜黃名帝國公園象棋

## 已完成
- 兩位玩家各自開啟遊戲即可雲端配對。
- 紅方／黑方由伺服器分配。
- 每回合固定 30 秒，伺服器時間判定超時。
- 棋步由伺服器使用 chess.js 驗證。
- 雲端保存棋局狀態，重新整理後可以繼續目前棋局。
- 認輸、將死、和棋、超時。
- 勝 3 分、和 1 分、敗 0 分的長期排行榜。
- 遊戲沒有暱稱輸入欄位。
- 黃名帝國論壇會員名稱透過 postMessage 帶入；沒有名稱則為「遊民」。

## Vercel 雲端記憶
需要在 Vercel 專案連接 Redis / KV 相容資料庫，並提供：
- KV_REST_API_URL
- KV_REST_API_TOKEN

沒有這兩個環境變數時，遊戲會顯示雲端記憶未設定，排行榜也不會寫入。

## 論壇會員橋接
論壇端可使用 public/forum-bridge.js 的邏輯，把目前登入會員帳號傳入遊戲 iframe。
遊戲只接受 https://www.wongmingempire.com 的訊息。
不應傳送論壇密碼、Cookie 或 Session Token。

## 同步
目前同步採短輪詢，因此不需要 WebSocket 服務即可在 Vercel Serverless 上運作。棋局資料以 Redis 作為共同雲端狀態。