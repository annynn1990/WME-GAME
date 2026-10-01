/*
 * 黃名帝國論壇 → WME-GAME 會員名稱橋接
 * 把這段放在論壇頁面可執行的 JS 區域。
 * 不讀取密碼、不傳送 Cookie，只傳目前已登入會員的公開帳號名稱。
 *
 * 由於論壇實際會員 DOM 可能隨 DZ 模板而異，
 * 先支援常見 Discuz! 變數，再支援 data-username。
 */
(function () {
  "use strict";

  function getMemberName() {
    try {
      if (window.Discuz && Discuz.uid && Discuz.username) return Discuz.username;
      if (typeof _G !== "undefined" && _G && _G.username) return _G.username;
      var el = document.querySelector("[data-username]");
      if (el && el.dataset.username) return el.dataset.username;
      var selectors = [
        "#um .vwmy",
        "#um .xi2",
        ".hm .vwmy",
        ".logininfo .xi2"
      ];
      for (var i = 0; i < selectors.length; i++) {
        var node = document.querySelector(selectors[i]);
        if (node && node.textContent.trim()) return node.textContent.trim();
      }
    } catch (_) {}
    return "";
  }

  function send() {
    var name = getMemberName();
    var iframe = document.querySelector('iframe[data-wme-game], iframe[src*="wme-game.vercel.app"]');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: "WME_MEMBER", username: name || "遊民" },
      "https://wme-game.vercel.app"
    );
  }

  window.addEventListener("load", function () {
    setTimeout(send, 500);
    setTimeout(send, 2000);
  });
  window.WMEGameSendMember = send;
})();
