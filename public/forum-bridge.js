/*
 * 黃名帝國論壇 → WME-GAME 會員名稱橋接
 * 僅傳送公開帳號名稱，不讀取密碼、Cookie 或 Session Token。
 */
(function () {
  "use strict";
  var allowedOrigins = [
    "https://wme-game.vercel.app",
    "https://yanxing-county-game.vercel.app",
    "https://yanxing-county-game-annynn1990s-projects.vercel.app",
    "https://yanxing-county-game-git-main-annynn1990s-projects.vercel.app"
  ];

  function getMemberName() {
    try {
      if (window.Discuz && Discuz.uid && Discuz.username) return Discuz.username;
      if (typeof _G !== "undefined" && _G && _G.username) return _G.username;
      var el = document.querySelector("[data-username]");
      if (el && el.dataset.username) return el.dataset.username;
      var selectors = ["#um .vwmy", "#um .xi2", ".hm .vwmy", ".logininfo .xi2"];
      for (var i = 0; i < selectors.length; i++) {
        var node = document.querySelector(selectors[i]);
        if (node && node.textContent.trim()) return node.textContent.trim();
      }
    } catch (_) {}
    return "";
  }

  function send() {
    var name = getMemberName() || "遊民";
    var frames = document.querySelectorAll(
      'iframe[data-wme-game], iframe[data-wme-county], iframe[src*="wme-game.vercel.app"], iframe[src*="yanxing-county-game"]'
    );
    Array.prototype.forEach.call(frames, function (iframe) {
      if (!iframe.contentWindow || !iframe.src) return;
      try {
        var origin = new URL(iframe.src, window.location.href).origin;
        if (allowedOrigins.indexOf(origin) === -1) return;
        iframe.contentWindow.postMessage({ type: "WME_MEMBER", username: name }, origin);
      } catch (_) {}
    });
  }

  window.addEventListener("load", function () {
    setTimeout(send, 500);
    setTimeout(send, 2000);
  });
  window.WMEGameSendMember = send;
})();