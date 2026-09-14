/**
 * 大厅 / 后室共用的客户端形态判断。
 * iPad（含报成 Macintosh 的 iPadOS）算平板，不和手机走同一套限制。
 */
export function classifyClientDevice(opts) {
  var ua = String((opts && opts.ua) || "");
  var platform = String((opts && opts.platform) || "");
  var maxTouch = Number((opts && opts.maxTouchPoints) || 0);
  var minSide = Number((opts && opts.minScreenSide) || 0);
  var ipad =
    /iPad/i.test(ua) ||
    (platform === "MacIntel" && maxTouch > 1 && !/iPhone|iPod/i.test(ua));
  if (ipad) return "tablet";
  if (/iPhone|iPod/i.test(ua)) return "mobile";
  if (/Android|HarmonyOS/i.test(ua)) {
    if (minSide >= 768) return "tablet";
    if (/Mobile/i.test(ua)) return "mobile";
    return "tablet";
  }
  if (/Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "mobile";
  if (minSide > 0 && minSide < 768 && maxTouch > 0) return "mobile";
  if (minSide >= 768 && maxTouch > 1) return "tablet";
  return "desktop";
}

export function isPhoneClientDevice(kind) {
  return kind === "mobile";
}

export function isTabletClientDevice(kind) {
  return kind === "tablet";
}

export function isWeChatBrowser(ua) {
  return /MicroMessenger|wxwork|miniProgram/i.test(String(ua || ""));
}

export function canAutoOpenSystemBrowser(ua, opts) {
  var text = String(ua || "");
  if (!isWeChatBrowser(text) || !/Android|HarmonyOS/i.test(text)) return false;
  return classifyClientDevice(Object.assign({ ua: text }, opts || {})) === "tablet";
}

/** Android 微信可尝试跳出到系统浏览器；iOS 微信没有公开接口。 */
export function systemBrowserIntentUrl(href) {
  var url;
  try {
    url = new URL(String(href || ""), "https://example.com");
  } catch (_err) {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  var path = url.pathname + url.search + url.hash;
  if (!path) path = "/";
  var fallback = encodeURIComponent(url.href);
  return (
    "intent://" +
    url.host +
    path +
    "#Intent;scheme=" +
    url.protocol.replace(":", "") +
    ";action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=" +
    fallback +
    ";end"
  );
}
