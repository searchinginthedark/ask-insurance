// Applies the reader's chosen look before the page paints. It lives in its own file because the
// site's Content-Security-Policy allows no inline scripts. Storage can throw; the default then wins.
(function () {
  try { if (localStorage.getItem("ai-look") === "berry") document.documentElement.setAttribute("data-look", "berry"); } catch (e) { /* default look */ }
})();
