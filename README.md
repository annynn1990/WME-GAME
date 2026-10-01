# WME-GAME｜黃名帝國公園象棋

## 功能
- 黃名帝國論壇會員帳號作為遊戲暱稱，遊戲內沒有改名輸入框。
- 未收到論壇會員名稱時顯示「遊民」。
- 每回合 30 秒思考倒數，超時判負。
- 合法象棋走法、將軍／將死／和棋判定。
- Vercel 雲端排行榜記憶：勝 3 分、和 1 分、敗 0 分。
- RWD，適合論壇嵌入或獨立開啟。

## Vercel 雲端記憶
在 Vercel 綁定 Redis 後提供：
- KV_REST_API_URL
- KV_REST_API_TOKEN

目前 API 使用 Upstash Redis 相容介面。

## 論壇會員名稱橋接
遊戲頁面等待父頁（wongmingempire.com）以 postMessage 傳送：
```js
iframe.contentWindow.postMessage(
  { type: "WME_MEMBER", username: "論壇會員帳號" },
  "https://wme-game.vercel.app"
);
```
遊戲只接受 `https://www.wongmingempire.com` 的訊息，不提供玩家自行輸入暱稱。

建議在論壇現有會員資訊 DOM／登入狀態程式取得帳號後再傳送；不要把論壇密碼、Cookie 或 Session Token 傳給遊戲。
