package com.lacalc.offline;

import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** 顶层类而非匿名类：规避 build-tools 34 d8-dev 对匿名类 NPE 的 bug */
class WebViewClientImpl extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
        return !"file".equals(req.getUrl().getScheme());
    }
}
