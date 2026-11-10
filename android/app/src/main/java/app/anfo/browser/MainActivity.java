package app.anfo.browser;

import android.os.Bundle;

import androidx.appcompat.app.AppCompatDelegate;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulama her zaman karanlik: "karanlik sayfa" secenegi de buna dayanir.
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        registerPlugin(WebTabsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
