package app.anfo.browser;

import android.annotation.SuppressLint;
import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Her sekme icin gercek bir Android WebView yonetir. React arayuzu (Capacitor WebView)
 * altta kalir; sayfa, arayuzun bildirdigi dikdortgenin ustune yerlestirilen kapsayicida cizilir.
 * Ayrica: Kalkan (reklam/izleyici engelleme), hafif mod, karanlik sayfa, okuma metni, tam ekran.
 */
@CapacitorPlugin(name = "WebTabs")
public class WebTabsPlugin extends Plugin {

    // Sayfadan okunabilir metni cikarir: dogrudan <p> cocuklari en cok metin tasiyan kapsayici secilir.
    private static final String READER_JS = """
        (function(){
          function plen(el){var n=0,ps=el.querySelectorAll('p');for(var i=0;i<ps.length;i++){n+=(ps[i].innerText||'').length}return n}
          var best=document.querySelector('article'),score=best?plen(best)*1.4:0;
          var c=document.querySelectorAll('main,[role=main],section,div');
          for(var i=0;i<c.length&&i<4000;i++){var el=c[i],ch=el.children,n=0;
            for(var j=0;j<ch.length;j++){if(ch[j].tagName==='P')n+=(ch[j].innerText||'').length}
            if(n>score){score=n;best=el}}
          if(!best||score<300)best=document.body;
          var out=[],total=0,seen={};
          var els=best.querySelectorAll('h1,h2,h3,p,li,blockquote,pre,img');
          for(var k=0;k<els.length&&out.length<500&&total<80000;k++){var e=els[k];
            if(e.tagName==='IMG'){if(e.naturalWidth>=320&&e.currentSrc&&e.currentSrc.indexOf('http')===0)out.push({t:'img',v:e.currentSrc});continue}
            if(e.tagName!=='PRE'&&e.querySelector('p,li'))continue;
            var tx=(e.innerText||'').trim();if(tx.length<2||seen[tx])continue;seen[tx]=1;total+=tx.length;
            var t=e.tagName==='P'?'p':e.tagName==='LI'?'li':e.tagName==='BLOCKQUOTE'?'q':e.tagName==='PRE'?'pre':'h';
            out.push({t:t,v:tx})}
          return JSON.stringify({title:document.title,url:location.href,blocks:out});
        })()
        """;

    private static final String COSMETIC_CSS =
        ".adsbygoogle,ins.adsbygoogle,[id^=\"google_ads_\"],[id^=\"div-gpt-ad\"],[data-ad-slot],[data-ad-client],amp-ad,amp-embed[type=\"taboola\"],"
            + "iframe[src*=\"doubleclick.net\"],iframe[src*=\"googlesyndication\"],iframe[id^=\"google_ads_iframe\"],"
            + "[id*=\"taboola-\"],[class*=\"trc_related\"],.OUTBRAIN,[data-widget-id^=\"AR_\"],[aria-label=\"Advertisement\"],[aria-label=\"Reklam\"]"
            + "{display:none!important}";
    private static final String LITE_CSS =
        "*,*::before,*::after{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important;scroll-behavior:auto!important}";

    private final Map<String, WebView> tabs = new HashMap<>();
    private final Set<String> loading = new HashSet<>();
    private final Set<String> fresh = new HashSet<>();
    private final GradientDrawable shape = new GradientDrawable();
    private final Handler main = new Handler(Looper.getMainLooper());
    private FrameLayout container;
    private String activeId;
    private boolean wantVisible;
    private int imeBottom;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private String defaultUa;
    private volatile boolean inForeground = true;
    private volatile int cacheMode = WebSettings.LOAD_DEFAULT;
    private ComponentCallbacks2 pressureCallbacks;

    // Engelleme karari arka plan is parcaciginda verilir; bu alanlar oradan okunur.
    private volatile boolean shield = true, lite = false, blockImages = false, dark = false, desktop = false;
    private volatile Set<String> blocklist = new HashSet<>();
    private final Set<String> allow = ConcurrentHashMap.newKeySet();
    private final Map<String, String> pageHost = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> blocked = new ConcurrentHashMap<>();
    private final Set<String> pendingEmit = ConcurrentHashMap.newKeySet();

    // Kullanici betikleri (configure ile gelir). Liste degistiginde yeni bir liste atanir.
    private volatile List<Script> scripts = new ArrayList<>();

    private static final class Script {
        final String[] hosts; // bos = tum siteler
        final String css;
        final String js;
        final int index;

        Script(String[] hosts, String css, String js, int index) {
            this.hosts = hosts;
            this.css = css;
            this.js = js;
            this.index = index;
        }
    }

    @Override
    protected void handleOnPause() {
        inForeground = false;
        getActivity().runOnUiThread(() -> {
            for (WebView w : tabs.values()) w.onPause();
            // pauseTimers global etkilidir (tum WebView'lar); bir ornek uzerinden bir kez cagrilir.
            bridge.getWebView().pauseTimers();
        });
    }

    @Override
    protected void handleOnResume() {
        inForeground = true;
        getActivity().runOnUiThread(() -> {
            bridge.getWebView().resumeTimers();
            WebView w = (wantVisible && activeId != null) ? tabs.get(activeId) : null;
            if (w != null) w.onResume();
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (pressureCallbacks != null) {
            getContext().getApplicationContext().unregisterComponentCallbacks(pressureCallbacks);
            pressureCallbacks = null;
        }
    }

    @Override
    public void load() {
        new Thread(this::loadBlocklist).start();
        pressureCallbacks = new ComponentCallbacks2() {
            @Override
            public void onTrimMemory(int level) {
                if (level < ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) return;
                // Gorunmeyen sekmeler zaten duraklatilmis durumda; yine de emin olmak icin tekrar duraklatilir.
                for (Map.Entry<String, WebView> e : tabs.entrySet()) {
                    if (!(wantVisible && e.getKey().equals(activeId))) e.getValue().onPause();
                }
                JSObject data = new JSObject();
                data.put("level", level);
                notifyListeners("memoryPressure", data);
            }

            @Override
            public void onLowMemory() {
                JSObject data = new JSObject();
                data.put("level", ComponentCallbacks2.TRIM_MEMORY_COMPLETE);
                notifyListeners("memoryPressure", data);
            }

            @Override
            public void onConfigurationChanged(Configuration newConfig) {}
        };
        getContext().getApplicationContext().registerComponentCallbacks(pressureCallbacks);
        getActivity().runOnUiThread(() -> {
            container = new FrameLayout(getActivity());
            shape.setColor(Color.BLACK);
            container.setBackground(shape);
            container.setClipToOutline(true);
            container.setAlpha(0f);
            container.setVisibility(View.GONE);
            parent().addView(container, new ViewGroup.LayoutParams(0, 0));

            // Klavye acildiginda sayfanin alt kismi klavyenin arkasinda kalmasin.
            ViewCompat.setOnApplyWindowInsetsListener(container, (v, insets) -> {
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                imeBottom = ime.bottom;
                applyImePadding();
                return insets;
            });

            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    if (customView != null) {
                        hideCustomView();
                        return;
                    }
                    WebView w = activeId == null ? null : tabs.get(activeId);
                    if (w != null && wantVisible && w.getVisibility() == View.VISIBLE && w.canGoBack()) w.goBack();
                    else notifyListeners("backButton", new JSObject());
                }
            });
        });
    }

    private void loadBlocklist() {
        Set<String> set = new HashSet<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(getContext().getAssets().open("public/blocklist.txt")))) {
            String line;
            while ((line = r.readLine()) != null) {
                line = line.trim().toLowerCase();
                if (!line.isEmpty() && line.charAt(0) != '#') set.add(line);
            }
        } catch (Exception ignored) {}
        blocklist = set;
    }

    private ViewGroup parent() {
        return (ViewGroup) bridge.getWebView().getParent();
    }

    private void applyImePadding() {
        int overlap = Math.round(container.getY() + container.getHeight()) - (parent().getHeight() - imeBottom);
        container.setPadding(0, 0, 0, imeBottom > 0 ? Math.max(0, overlap) : 0);
    }

    private void applyVisibility() {
        boolean any = false;
        for (Map.Entry<String, WebView> e : tabs.entrySet()) {
            boolean on = wantVisible && e.getKey().equals(activeId);
            WebView w = e.getValue();
            // Gorunmeyen sekmenin JS zamanlayicilari ve medyasi durur; gorunen sekme uygulama one geldiyse calisir.
            if (on && inForeground) w.onResume();
            else w.onPause();
            w.setVisibility(on ? View.VISIBLE : View.GONE);
            any |= on;
        }
        // Sayfa arayuzun ustune sert bir kesmeyle degil, kisa bir cozulmeyle girer/cikar.
        container.animate().cancel();
        if (any) {
            container.setVisibility(View.VISIBLE);
            container.animate().alpha(1f).setDuration(220).start();
        } else if (container.getVisibility() == View.VISIBLE) {
            container.animate().alpha(0f).setDuration(120).withEndAction(() -> container.setVisibility(View.GONE)).start();
        }
    }

    private void emit(String id, WebView w) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("url", w.getUrl());
        o.put("title", w.getTitle());
        o.put("loading", loading.contains(id));
        o.put("canGoBack", w.canGoBack());
        o.put("canGoForward", w.canGoForward());
        AtomicInteger n = blocked.get(id);
        o.put("blocked", n == null ? 0 : n.get());
        notifyListeners("tabUpdate", o);
    }

    private static String hostOf(String url) {
        try {
            String h = Uri.parse(url).getHost();
            if (h == null) return "";
            h = h.toLowerCase();
            return h.startsWith("www.") ? h.substring(4) : h;
        } catch (Exception e) {
            return "";
        }
    }

    /** Alan adi ya da ust alanlarindan biri listedeyse eslesen girdiyi dondurur. */
    private String listed(String host) {
        Set<String> list = blocklist;
        String h = host.toLowerCase();
        while (true) {
            if (list.contains(h)) return h;
            int dot = h.indexOf('.');
            if (dot < 0) return null;
            h = h.substring(dot + 1);
        }
    }

    private static WebResourceResponse empty() {
        return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse filter(String id, WebResourceRequest request) {
        if (request.isForMainFrame()) return null;
        Uri uri = request.getUrl();
        String host = uri.getHost();
        if (host == null) return null;
        if (shield) {
            String page = pageHost.get(id);
            if (page == null || !allow.contains(page)) {
                String hit = listed(host);
                // Sayfanin kendi alan adina ait istekler engellenmez.
                if (hit != null && (page == null || !(page.equals(hit) || page.endsWith("." + hit)))) {
                    AtomicInteger n = blocked.get(id);
                    if (n != null) n.incrementAndGet();
                    if (pendingEmit.add(id)) {
                        main.postDelayed(() -> {
                            pendingEmit.remove(id);
                            WebView w = tabs.get(id);
                            if (w != null) emit(id, w);
                        }, 700);
                    }
                    return empty();
                }
            }
        }
        if (lite) {
            String p = uri.getPath();
            if (p != null && (p.endsWith(".woff2") || p.endsWith(".woff") || p.endsWith(".ttf") || p.endsWith(".otf"))) return empty();
        }
        return null;
    }

    private void injectCss(String id, WebView w) {
        String page = pageHost.get(id);
        StringBuilder css = new StringBuilder();
        if (shield && (page == null || !allow.contains(page))) css.append(COSMETIC_CSS);
        if (lite) css.append(LITE_CSS);
        w.evaluateJavascript(
            "(function(){var s=document.getElementById('__anfo');if(!s){s=document.createElement('style');s.id='__anfo';"
                + "(document.head||document.documentElement).appendChild(s)}s.textContent=" + JSONObject.quote(css.toString()) + "})()",
            null
        );
    }

    /** Sayfa host'u betigin match listesiyle eslesiyor mu (tam esitlik ya da alt alan adi). */
    private static boolean matches(Script s, String host) {
        if (s.hosts.length == 0) return true;
        if (host == null || host.isEmpty()) return false;
        for (String m : s.hosts) {
            if (host.equals(m) || host.endsWith("." + m)) return true;
        }
        return false;
    }

    /** configure ile gelen betikleri ayristirir. match bos ise tum sitelerde calisir. */
    private static List<Script> parseScripts(JSArray arr) {
        List<Script> out = new ArrayList<>();
        if (arr == null) return out;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            String match = o.optString("match", "").trim();
            List<String> hs = new ArrayList<>();
            for (String part : match.split(",")) {
                String h = part.trim().toLowerCase();
                if (h.startsWith(".")) h = h.substring(1);
                if (h.startsWith("www.")) h = h.substring(4);
                if (!h.isEmpty()) hs.add(h);
            }
            // Match yazilmis ama hicbir gecerli alan adi yoksa betik tum sitelere uygulanmaz.
            if (!match.isEmpty() && hs.isEmpty()) continue;
            String css = o.optString("css", "");
            String js = o.optString("js", "");
            if (css.isEmpty() && js.isEmpty()) continue;
            out.add(new Script(hs.toArray(new String[0]), css, js, i));
        }
        return out;
    }

    /**
     * Sayfa host'una eslesen kullanici betiklerini uygular. CSS her seferinde ayni id'li
     * style ogesine yazilir (ikinci ekleme olmaz); JS ayni sayfada bir kez calisir (window.__anfoExt bayragi).
     * Her betik ayri evaluateJavascript cagrisinda calisir; birinin sozdizimi hatasi digerlerini etkilemez.
     */
    private void injectScripts(String id, WebView w) {
        String host = pageHost.get(id);
        for (Script s : scripts) {
            if (!matches(s, host)) continue;
            if (!s.css.isEmpty()) {
                String tag = "__anfo_ext_" + s.index;
                w.evaluateJavascript(
                    "(function(){var s=document.getElementById('" + tag + "');if(!s){s=document.createElement('style');s.id='" + tag
                        + "';s.setAttribute('data-anfo-ext','');(document.head||document.documentElement).appendChild(s)}s.textContent="
                        + JSONObject.quote(s.css) + "})()",
                    null
                );
            }
            if (!s.js.isEmpty()) {
                w.evaluateJavascript(
                    "(function(){if(!window.__anfoExt)window.__anfoExt={};if(!window.__anfoExt[" + s.index + "]){window.__anfoExt["
                        + s.index + "]=1;try{\n" + s.js + "\n}catch(e){}}})()",
                    null
                );
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void applySettings(WebView w) {
        WebSettings s = w.getSettings();
        s.setBlockNetworkImage(blockImages);
        s.setCacheMode(cacheMode);
        if (Build.VERSION.SDK_INT >= 33) s.setAlgorithmicDarkeningAllowed(dark);
        else if (Build.VERSION.SDK_INT >= 29) s.setForceDark(dark ? WebSettings.FORCE_DARK_ON : WebSettings.FORCE_DARK_OFF);
        if (defaultUa == null) defaultUa = s.getUserAgentString();
        s.setUserAgentString(desktop ? defaultUa.replaceAll("\\(Linux; Android[^)]*\\)", "(X11; Linux x86_64)").replace(" Mobile", "") : defaultUa);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView create(final String id) {
        WebView w = new WebView(getActivity());
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setOffscreenPreRaster(false);
        // Gorunmeyen sekmelerin renderer'i dusuk oncelige insin (gorunurken oncelik korunur).
        if (Build.VERSION.SDK_INT >= 26) w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        w.setBackgroundColor(Color.WHITE);
        applySettings(w);
        blocked.put(id, new AtomicInteger());

        w.setWebViewClient(new WebViewClient() {
            // Renderer olurse (bellek yetmezligi) sekme WebView'i atilir; uygulama kapanmaz.
            // Sekme bir sonraki yuklemede yeniden olusturulur.
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (tabs.get(id) == view) tabs.remove(id);
                loading.remove(id);
                container.removeView(view);
                view.destroy();
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return filter(id, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                try {
                    getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                loading.add(id);
                pageHost.put(id, hostOf(url));
                AtomicInteger n = blocked.get(id);
                if (n != null) n.set(0);
                emit(id, view);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectCss(id, view);
                injectScripts(id, view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loading.remove(id);
                if (fresh.remove(id)) view.clearHistory();
                injectCss(id, view);
                injectScripts(id, view);
                emit(id, view);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                pageHost.put(id, hostOf(url));
                emit(id, view);
            }
        });

        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String title) {
                emit(id, view);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customCallback = callback;
                view.setBackgroundColor(Color.BLACK);
                ((ViewGroup) getActivity().getWindow().getDecorView()).addView(view, new ViewGroup.LayoutParams(-1, -1));
            }

            @Override
            public void onHideCustomView() {
                hideCustomView();
            }
        });

        // Sayfa ici arama sonuclari (sayac ve etkin eslesme) arayuze olay olarak iletilir.
        w.setFindListener((active, count, done) -> {
            JSObject o = new JSObject();
            o.put("id", id);
            o.put("active", active);
            o.put("count", count);
            o.put("done", done);
            notifyListeners("findResult", o);
        });

        // Indirmeler sistemin varsayilan uygulamasina devredilir.
        w.setDownloadListener((url, ua, disposition, mime, length) -> {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {}
        });

        w.setVisibility(View.GONE);
        container.addView(w, new FrameLayout.LayoutParams(-1, -1));
        tabs.put(id, w);
        return w;
    }

    private void hideCustomView() {
        if (customView == null) return;
        ((ViewGroup) getActivity().getWindow().getDecorView()).removeView(customView);
        customView = null;
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        shield = call.getBoolean("shield", true);
        lite = call.getBoolean("lite", false);
        blockImages = call.getBoolean("blockImages", false);
        dark = call.getBoolean("dark", false);
        desktop = call.getBoolean("desktop", false);
        allow.clear();
        JSArray arr = call.getArray("allow");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                String h = arr.optString(i, "");
                if (!h.isEmpty()) allow.add(h);
            }
        }
        scripts = parseScripts(call.getArray("scripts"));
        switch (call.getString("cacheMode", "normal")) {
            case "aggressive": cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK; break;
            case "off": cacheMode = WebSettings.LOAD_NO_CACHE; break;
            default: cacheMode = WebSettings.LOAD_DEFAULT; break;
        }
        final boolean reload = call.getBoolean("reload", false);
        getActivity().runOnUiThread(() -> {
            for (WebView w : tabs.values()) applySettings(w);
            WebView active = activeId == null ? null : tabs.get(activeId);
            if (reload && active != null) active.reload();
            call.resolve();
        });
    }

    @PluginMethod
    public void open(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        if (id == null || url == null) {
            call.reject("id ve url gerekli");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView w = tabs.get(id);
            if (w == null) w = create(id);
            else fresh.add(id); // yeni ust duzey girdi: onceki yerel gecmis temizlenir
            w.loadUrl(url);
            applyVisibility();
            call.resolve();
        });
    }

    @PluginMethod
    public void show(PluginCall call) {
        String id = call.getString("id");
        getActivity().runOnUiThread(() -> {
            activeId = id;
            wantVisible = true;
            applyVisibility();
            call.resolve();
        });
    }

    @PluginMethod
    public void hideAll(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            wantVisible = false;
            applyVisibility();
            call.resolve();
        });
    }

    @PluginMethod
    public void setBounds(PluginCall call) {
        final float d = getContext().getResources().getDisplayMetrics().density;
        final float x = call.getFloat("x", 0f), y = call.getFloat("y", 0f);
        final float w = call.getFloat("width", 0f), h = call.getFloat("height", 0f);
        final float r = call.getFloat("radius", 0f);
        getActivity().runOnUiThread(() -> {
            View host = bridge.getWebView();
            ViewGroup.LayoutParams lp = container.getLayoutParams();
            lp.width = Math.round(w * d);
            lp.height = Math.round(h * d);
            container.setLayoutParams(lp);
            container.setX(host.getX() + x * d);
            container.setY(host.getY() + y * d);
            shape.setCornerRadius(r * d);
            container.post(this::applyImePadding);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        String id = call.getString("id");
        getActivity().runOnUiThread(() -> {
            WebView w = tabs.remove(id);
            loading.remove(id);
            fresh.remove(id);
            pageHost.remove(id);
            blocked.remove(id);
            if (w != null) {
                container.removeView(w);
                w.destroy();
            }
            applyVisibility();
            call.resolve();
        });
    }

    private interface Action {
        void run(WebView w);
    }

    private void with(PluginCall call, Action action) {
        String id = call.getString("id");
        getActivity().runOnUiThread(() -> {
            WebView w = tabs.get(id);
            if (w != null) action.run(w);
            call.resolve();
        });
    }

    @PluginMethod
    public void back(PluginCall call) {
        with(call, WebView::goBack);
    }

    @PluginMethod
    public void forward(PluginCall call) {
        with(call, WebView::goForward);
    }

    @PluginMethod
    public void reload(PluginCall call) {
        with(call, WebView::reload);
    }

    /** Sekme yakinlastirma: metin olcegi yuzde olarak (factor 0.5-2.0 -> %50-%200). */
    @PluginMethod
    public void zoom(PluginCall call) {
        final double f = Math.max(0.5, Math.min(2.0, call.getDouble("factor", 1.0)));
        with(call, w -> w.getSettings().setTextZoom((int) Math.round(f * 100)));
    }

    /** Sayfada metin arar; bos sorgu eslesmeleri temizler. Sonuc "findResult" olayiyla gelir. */
    @PluginMethod
    public void find(PluginCall call) {
        final String query = call.getString("query", "");
        with(call, w -> {
            if (query.isEmpty()) w.clearMatches();
            else w.findAllAsync(query);
        });
    }

    /** Sonraki (forward) ya da onceki eslesmeye gecer. */
    @PluginMethod
    public void findNext(PluginCall call) {
        final boolean forward = call.getBoolean("forward", true);
        with(call, w -> w.findNext(forward));
    }

    @PluginMethod
    public void findClear(PluginCall call) {
        with(call, WebView::clearMatches);
    }

    /** Sayfanin okunabilir icerigini JSON metni olarak dondurur (okuma modu ve AI ozeti icin). */
    @PluginMethod
    public void reader(PluginCall call) {
        String id = call.getString("id");
        getActivity().runOnUiThread(() -> {
            WebView w = tabs.get(id);
            if (w == null) {
                call.reject("sekme yok");
                return;
            }
            w.evaluateJavascript(READER_JS, value -> {
                JSObject o = new JSObject();
                o.put("data", value);
                call.resolve(o);
            });
        });
    }

    @PluginMethod
    public void share(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, call.getString("url", ""));
        send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", ""));
        getActivity().startActivity(Intent.createChooser(send, null));
        call.resolve();
    }

    @PluginMethod
    public void immersive(PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getActivity().getWindow(), getActivity().getWindow().getDecorView());
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().moveTaskToBack(true);
        call.resolve();
    }

    /**
     * Yalnizca HTTP onbellegini temizler (WebView cache). Cerez ve depolama (oturumlar) korunur.
     * freedMB yaklasik degerdir: getCacheDir() boyutunun silme oncesi/sonrasi farki.
     */
    @PluginMethod
    public void clearCache(PluginCall call) {
        new Thread(() -> {
            final long before = dirSize(getContext().getCacheDir());
            getActivity().runOnUiThread(() -> {
                for (WebView w : tabs.values()) w.clearCache(true);
                // Dosya silme islemi asenkron olabilir; kisa bir bekleyisten sonra olculur.
                new Thread(() -> {
                    try {
                        Thread.sleep(400);
                    } catch (InterruptedException ignored) {}
                    long after = dirSize(getContext().getCacheDir());
                    JSObject o = new JSObject();
                    o.put("freedMB", mb(Math.max(0, before - after)));
                    call.resolve(o);
                }).start();
            });
        }).start();
    }

    @PluginMethod
    public void memory(PluginCall call) {
        Runtime rt = Runtime.getRuntime();
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        if (am != null) am.getMemoryInfo(mi);
        JSObject o = new JSObject();
        o.put("usedMB", mb(rt.totalMemory() - rt.freeMemory()));
        o.put("maxMB", mb(rt.maxMemory()));
        o.put("systemAvailMB", mb(mi.availMem));
        o.put("lowMemory", mi.lowMemory);
        call.resolve(o);
    }

    private static double mb(long bytes) {
        return Math.round(bytes / 1048576.0 * 10) / 10.0;
    }

    private static long dirSize(File f) {
        if (f == null || !f.exists()) return 0;
        if (f.isFile()) return f.length();
        long total = 0;
        File[] children = f.listFiles();
        if (children != null) {
            for (File c : children) total += dirSize(c);
        }
        return total;
    }
}
