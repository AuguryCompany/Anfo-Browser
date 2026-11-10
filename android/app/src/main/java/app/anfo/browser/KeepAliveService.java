package app.anfo.browser;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.content.ContextCompat;

/**
 * Model indirme ve yerel AI uretimi sirasinda uygulamanin arka planda dondurulmasini onler.
 * Bildirimde ilerleme gosterilir; is bitince servis durdurulur.
 */
public class KeepAliveService extends Service {
    private static final String CHANNEL = "anfo_work";
    private static final int ID = 4107;
    private static final String EXTRA_TEXT = "text";
    private static final String EXTRA_PROGRESS = "progress";
    private PowerManager.WakeLock lock;

    /** Servisi baslatir ya da bildirimi gunceller. progress < 0 ise belirsiz ilerleme gosterilir. */
    public static void start(Context c, String text, int progress) {
        Intent i = new Intent(c, KeepAliveService.class).putExtra(EXTRA_TEXT, text).putExtra(EXTRA_PROGRESS, progress);
        ContextCompat.startForegroundService(c, i);
    }

    public static void stop(Context c) {
        c.stopService(new Intent(c, KeepAliveService.class));
    }

    private Notification build(String text, int progress) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Arka plan işleri", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("Anfo")
                .setContentText(text)
                .setContentIntent(pi)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(100, Math.max(0, progress), progress < 0);
        return b.build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String text = intent != null && intent.getStringExtra(EXTRA_TEXT) != null ? intent.getStringExtra(EXTRA_TEXT) : "Çalışıyor…";
        int progress = intent != null ? intent.getIntExtra(EXTRA_PROGRESS, -1) : -1;
        Notification n = build(text, progress);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID, n);
        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "anfo:work");
            lock.acquire(3 * 60 * 60 * 1000L); // en fazla 3 saat
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
