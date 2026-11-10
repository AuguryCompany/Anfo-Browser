package app.anfo.browser;

import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatDelegate;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulama her zaman karanlik: "karanlik sayfa" secenegi de buna dayanir.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        registerPlugin(WebTabsPlugin.class);
        super.onCreate(savedInstanceState);
        // WebView'larin ortak renderer sureci bellek yetmezligi gibi bir nedenle oldurulurse
        // Android varsayilan olarak uygulamayi da kapatir. Bunun yerine arayuz yeniden yuklenir
        // (durum localStorage'da oldugu icin sekmeler ve ayarlar korunur).
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                runOnUiThread(MainActivity.this::recreate);
                return true;
            }
        });
    }
}
