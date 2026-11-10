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
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * "Engelleri as": WebView'larin HTTPS trafigi icin yerel (127.0.0.1) CONNECT vekili.
 *
 *  - Alan adlari DNS-over-HTTPS ile (RFC 8484) cozulur: once Quad9 (kar amaci gutmeyen, IP kaydi tutmaz),
 *    yedek Cloudflare (24 saatte silinen kayit). Internet saglayicisi hangi siteleri actigini DNS'ten goremez,
 *    DNS engelleri/yonlendirmeleri asilir. Ikisine de ulasilamazsa sistem DNS'ine donulur.
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
        String[] servers = {"https://9.9.9.9/dns-query", "https://1.1.1.1/dns-query"};
        for (String srv : servers) {
            try {
                List<InetAddress> out = new ArrayList<>();
                int ttl = doh(srv, key, out);
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

    /** RFC 8484 GET: ikili DNS sorgusu base64url ile gonderilir; A kayitlari eklenir, en kucuk TTL dondurulur. */
    static int doh(String server, String host, List<InetAddress> out) throws IOException {
        String q = b64url(query(host));
        HttpURLConnection c = (HttpURLConnection) new URL(server + "?dns=" + q).openConnection(java.net.Proxy.NO_PROXY);
        c.setConnectTimeout(4000);
        c.setReadTimeout(4000);
        c.setRequestProperty("Accept", "application/dns-message");
        try (InputStream in = c.getInputStream()) {
            return parse(readAll(in), out);
        } finally {
            c.disconnect();
        }
    }

    private static final char[] B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();

    /** Dolgusuz base64url (java.util.Base64 Android 8 gerektirir; uygulama Android 7'yi de destekler). */
    static String b64url(byte[] d) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.length; i += 3) {
            int n = (d[i] & 0xff) << 16 | (i + 1 < d.length ? (d[i + 1] & 0xff) << 8 : 0) | (i + 2 < d.length ? d[i + 2] & 0xff : 0);
            sb.append(B64[n >> 18 & 63]).append(B64[n >> 12 & 63]);
            if (i + 1 < d.length) sb.append(B64[n >> 6 & 63]);
            if (i + 2 < d.length) sb.append(B64[n & 63]);
        }
        return sb.toString();
    }

    /** Tek soruluk A sorgusu (kimlik 0, RD=1; RFC 8484 onbellek dostu olsun diye kimlik 0). */
    static byte[] query(String host) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(0); b.write(0); // kimlik
        b.write(1); b.write(0); // bayraklar: RD
        b.write(0); b.write(1); // QDCOUNT
        for (int i = 0; i < 6; i++) b.write(0); // AN/NS/AR
        for (String label : host.split("\\.")) {
            byte[] l = label.getBytes(StandardCharsets.US_ASCII);
            if (l.length == 0) continue;
            b.write(l.length);
            b.write(l, 0, l.length);
        }
        b.write(0);
        b.write(0); b.write(1); // QTYPE A
        b.write(0); b.write(1); // QCLASS IN
        return b.toByteArray();
    }

    private static int u16(byte[] b, int i) {
        return ((b[i] & 0xff) << 8) | (b[i + 1] & 0xff);
    }

    /** Ad alanini atlar (etiketler ya da 0xC0 isaretcisi). */
    private static int skipName(byte[] b, int i) {
        while (i < b.length) {
            int len = b[i] & 0xff;
            if (len == 0) return i + 1;
            if ((len & 0xc0) == 0xc0) return i + 2;
            i += len + 1;
        }
        return i;
    }

    static int parse(byte[] b, List<InetAddress> out) throws IOException {
        if (b.length < 12) return 0;
        if ((b[3] & 0x0f) != 0) return 0; // RCODE hata
        int qd = u16(b, 4), an = u16(b, 6);
        int i = 12;
        for (int k = 0; k < qd; k++) i = skipName(b, i) + 4;
        int ttl = Integer.MAX_VALUE;
        for (int k = 0; k < an && i + 10 <= b.length; k++) {
            i = skipName(b, i);
            int type = u16(b, i), rdlen = u16(b, i + 8);
            long t = ((long) u16(b, i + 4) << 16) | u16(b, i + 6);
            i += 10;
            if (i + rdlen > b.length) break;
            if (type == 1 && rdlen == 4) {
                out.add(InetAddress.getByAddress(new byte[] {b[i], b[i + 1], b[i + 2], b[i + 3]}));
                ttl = (int) Math.min(ttl, t);
            }
            i += rdlen;
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
