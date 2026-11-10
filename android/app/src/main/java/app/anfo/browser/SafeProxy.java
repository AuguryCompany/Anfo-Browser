package app.anfo.browser;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Engelleri as": WebView'larin HTTPS trafigi icin yerel (127.0.0.1) CONNECT vekili.
 *
 *  - Alan adlari DNS-over-HTTPS ile cozulur (Cloudflare 1.1.1.1, yedek Google 8.8.8.8); internet saglayicisinin
 *    DNS engelleri/yonlendirmeleri asilir. DoH ulasilamazsa sistem DNS'ine donulur.
 *  - TLS'in ilk paketi (ClientHello) site adinin ortasindan iki TCP parcasina bolunerek gonderilir; site adina
 *    bakan basit DPI filtreleri adi goremez. TCP akisi degismedigi icin sunucu farki gormez.
 *
 * Yalnizca java.* kullanir (Android'e bagimli degil), bu yuzden JVM'de de sinanabilir.
 */
public final class SafeProxy {
    private static ServerSocket server;
    private static ExecutorService pool;
    private static final Map<String, Entry> cache = new ConcurrentHashMap<>();
    private static final int CONNECT_TIMEOUT = 10000;

    private static final class Entry {
        final InetAddress[] addrs;
        final long until;

        Entry(InetAddress[] a, long until) {
            this.addrs = a;
            this.until = until;
        }
    }

    private SafeProxy() {}

    /** Vekili baslatir (zaten calisiyorsa ayni portu dondurur). */
    public static synchronized int start() throws IOException {
        if (server != null && !server.isClosed()) return server.getLocalPort();
        server = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
        pool = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "anfo-safe");
            t.setDaemon(true);
            return t;
        });
        final ServerSocket s = server;
        final ExecutorService p = pool;
        Thread acceptor = new Thread(() -> {
            while (!s.isClosed()) {
                try {
                    Socket c = s.accept();
                    p.execute(() -> handle(c));
                } catch (IOException e) {
                    if (s.isClosed()) return;
                }
            }
        }, "anfo-safe-accept");
        acceptor.setDaemon(true);
        acceptor.start();
        return s.getLocalPort();
    }

    public static synchronized void stop() {
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {}
        if (pool != null) pool.shutdownNow();
        server = null;
        pool = null;
    }

    private static void handle(Socket client) {
        Socket remote = null;
        try {
            client.setSoTimeout(30000);
            InputStream cin = client.getInputStream();
            OutputStream cout = client.getOutputStream();
            String head = readHead(cin);
            if (head == null) return;
            String[] first = head.split("\r\n", 2)[0].split(" ");
            if (first.length < 2 || !"CONNECT".equalsIgnoreCase(first[0])) {
                cout.write("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                return;
            }
            String target = first[1];
            int colon = target.lastIndexOf(':');
            String host = colon > 0 ? target.substring(0, colon) : target;
            int port = colon > 0 ? Integer.parseInt(target.substring(colon + 1)) : 443;
            if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);

            remote = connect(host, port);
            if (remote == null) {
                cout.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                return;
            }
            cout.write("HTTP/1.1 200 Connection Established\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            cout.flush();
            client.setSoTimeout(0);

            final Socket r = remote;
            final InputStream rin = r.getInputStream();
            final OutputStream rout = r.getOutputStream();
            pool.execute(() -> pipe(rin, cout, client, r));
            // Istemci -> sunucu: ilk parca (TLS ClientHello) site adinin ortasindan bolunur.
            byte[] buf = new byte[16384];
            int n = cin.read(buf);
            if (n > 0) {
                int cut = splitPoint(buf, n, host);
                if (cut > 0 && cut < n) {
                    rout.write(buf, 0, cut);
                    rout.flush();
                    sleepQuiet(); // iki parca ayri TCP bolumlerinde gitsin
                    rout.write(buf, cut, n - cut);
                } else {
                    rout.write(buf, 0, n);
                }
                rout.flush();
                pipe(cin, rout, client, r);
            }
        } catch (Exception ignored) {
        } finally {
            closeQuiet(client);
            closeQuiet(remote);
        }
    }

    /** TLS el sikismasiysa (0x16) site adinin ortasi, bulunamazsa 1. bayt; degilse bolme yok (-1). */
    static int splitPoint(byte[] b, int n, String host) {
        if (n < 6 || b[0] != 0x16) return -1;
        byte[] h = host.getBytes(StandardCharsets.US_ASCII);
        outer:
        for (int i = 5; i + h.length <= n; i++) {
            for (int j = 0; j < h.length; j++) if (b[i + j] != h[j]) continue outer;
            return i + Math.max(1, h.length / 2);
        }
        return 1;
    }

    private static Socket connect(String host, int port) {
        for (InetAddress a : resolve(host)) {
            Socket s = new Socket();
            try {
                s.setTcpNoDelay(true);
                s.connect(new InetSocketAddress(a, port), CONNECT_TIMEOUT);
                return s;
            } catch (IOException e) {
                closeQuiet(s);
            }
        }
        return null;
    }

    private static final Pattern IP = Pattern.compile("^[0-9.]+$|^[0-9a-fA-F:]+$");

    /** Alan adini DoH ile cozer; basarisizsa sistem DNS'i. Sonuc TTL boyunca (en az 60 sn) saklanir. */
    static InetAddress[] resolve(String host) {
        try {
            if (IP.matcher(host).matches()) return new InetAddress[] {InetAddress.getByName(host)};
        } catch (IOException e) {
            return new InetAddress[0];
        }
        String key = host.toLowerCase();
        Entry e = cache.get(key);
        if (e != null && e.until > System.currentTimeMillis()) return e.addrs;
        String[] servers = {"https://1.1.1.1/dns-query?type=A&name=", "https://8.8.8.8/resolve?type=A&name="};
        for (String srv : servers) {
            try {
                List<InetAddress> out = new ArrayList<>();
                int ttl = doh(srv + URLEncoder.encode(key, "UTF-8"), out);
                if (!out.isEmpty()) {
                    InetAddress[] arr = out.toArray(new InetAddress[0]);
                    cache.put(key, new Entry(arr, System.currentTimeMillis() + Math.max(60, ttl) * 1000L));
                    return arr;
                }
            } catch (Exception ignored) {}
        }
        try {
            InetAddress[] arr = InetAddress.getAllByName(host);
            cache.put(key, new Entry(arr, System.currentTimeMillis() + 60000L));
            return arr;
        } catch (IOException ex) {
            return new InetAddress[0];
        }
    }

    private static final Pattern ANSWER = Pattern.compile("\\{[^{}]*\\}");
    private static final Pattern TYPE_A = Pattern.compile("\"type\"\\s*:\\s*1\\s*[,}]");
    private static final Pattern DATA = Pattern.compile("\"data\"\\s*:\\s*\"([0-9.]+)\"");
    private static final Pattern TTL = Pattern.compile("\"TTL\"\\s*:\\s*(\\d+)");

    /** DNS JSON yanitindaki A kayitlarini ekler; en kucuk TTL'i dondurur. */
    static int doh(String url, List<InetAddress> out) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection(java.net.Proxy.NO_PROXY);
        c.setConnectTimeout(4000);
        c.setReadTimeout(4000);
        c.setRequestProperty("Accept", "application/dns-json");
        try (InputStream in = c.getInputStream()) {
            String body = new String(readAll(in), StandardCharsets.UTF_8);
            return parseAnswers(body, out);
        } finally {
            c.disconnect();
        }
    }

    static int parseAnswers(String body, List<InetAddress> out) throws IOException {
        int i = body.indexOf("\"Answer\"");
        if (i < 0) return 0;
        int ttl = Integer.MAX_VALUE;
        Matcher m = ANSWER.matcher(body.substring(i));
        while (m.find()) {
            String o = m.group();
            if (!TYPE_A.matcher(o).find()) continue;
            Matcher d = DATA.matcher(o);
            if (!d.find()) continue;
            out.add(InetAddress.getByName(d.group(1)));
            Matcher t = TTL.matcher(o);
            if (t.find()) ttl = Math.min(ttl, Integer.parseInt(t.group(1)));
        }
        return ttl == Integer.MAX_VALUE ? 0 : ttl;
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        int state = 0;
        while ((c = in.read()) != -1) {
            b.write(c);
            if (b.size() > 16384) return null;
            state = (c == '\r' && (state == 0 || state == 2)) ? state + 1 : (c == '\n' && (state == 1 || state == 3)) ? state + 1 : 0;
            if (state == 4) return b.toString("US-ASCII");
        }
        return null;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) != -1) {
            b.write(buf, 0, n);
            if (b.size() > 65536) break;
        }
        return b.toByteArray();
    }

    private static void pipe(InputStream in, OutputStream out, Socket a, Socket b) {
        byte[] buf = new byte[16384];
        try {
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                out.flush();
            }
        } catch (IOException ignored) {
        } finally {
            closeQuiet(a);
            closeQuiet(b);
        }
    }

    private static void sleepQuiet() {
        try {
            Thread.sleep(5);
        } catch (InterruptedException ignored) {}
    }

    private static void closeQuiet(Socket s) {
        try {
            if (s != null) s.close();
        } catch (IOException ignored) {}
    }
}
