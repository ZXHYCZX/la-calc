// endpoints.js — 端点路由：can(path) / go(path, body, resolve)
(function (S) {
  "use strict";

  const REG = {};
  function register(map) { for (const k in map) REG[k] = map[k]; }
  if (S.EP1) register(S.EP1);
  if (S.EP2) register(S.EP2);

  // path 归一化：去掉 query
  S.splitPath = function (e) {
    const s = String(e || "");
    const qi = s.indexOf("?");
    const path = qi < 0 ? s : s.slice(0, qi);
    const query = {};
    if (qi >= 0) {
      for (const kv of s.slice(qi + 1).split("&")) {
        const i = kv.indexOf("=");
        if (i > 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
      }
    }
    return { path, query };
  };

  S.can = function (e, r) {
    const { path } = S.splitPath(e);
    return !!REG[path];
  };

  // 返回 true 表示已处理（resolve 已调用）；false 表示本地不支持 → 调用方继续走网络
  S.go = function (e, r, resolve) {
    const { path, query } = S.splitPath(e);
    const handler = REG[path];
    if (!handler) return false;
    const body = Object.assign({}, (r && r.data) || {}, { __query: query });
    try {
      const out = handler(body);
      resolve(out);
      return true;
    } catch (err) {
      if (err && err.unsupported) return false; // 联网回退
      // 其它错误：本地失败，给出提示（不 reject，页面会显示红字）
      resolve({
        result: ["\\text{本地计算失败：}" + (err && err.message ? err.message.replace(/[\\{}]/g, "") : "未知错误") + "\\text{，请联网重试}"],
        content: "", errMsg: "本地计算失败，请联网重试",
        VIPMessage: "", test_records: [], _last: false, _next: false,
      });
      return true;
    }
  };
})(typeof S !== "undefined" ? S : (globalThis.S = globalThis.S || {}));
