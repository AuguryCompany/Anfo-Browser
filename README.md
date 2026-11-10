# Anfo

Minimal, OLED dostu bir tarayıcı. Kiraz rengi (`#e5385f`) vurgulu arayüzü, kenar çubuğu olmadan tek bir kontrol üzerine kurulu. React 19 + Vite 8 ile yazıldı; Android için Capacitor 8 kullanır.

Logo: `assets/anfo-logo.png` (Android simgeleri, açılış ekranı ve web simgeleri bundan üretilir).

## Tek kontrol: Ada

Ekranın altındaki (ya da ayarlanabilir olarak üstteki) Ada, tarayıcının tüm kontrolüdür:

- **Dokun:** arama ve adres alanı "Alan" açılır.
- **Yatay kaydır:** geri / ileri.
- **Basılı tut:** iki halkalı yay menüsü açılır.
  - İç halka, gezinme: Geri, İleri, Yenile, Sabitle, Ayarlar.
  - Dış halka, sayfa araçları: Okuma modu, AI özeti, Tam ekran, Kalkan, Paylaş.

## Özellikler

### Gezinme ve arayüz

1. Sekmeler: yeni sekme açma (`Alt+T`) ve sekme kapatma (`Alt+W`).
2. Her panelde sol üstte **geri**, sağ üstte **kapat** düğmesi bulunur.
3. Ana sayfada sağ üstte **bildirim** (okunmamış sayı rozeti), **GitHub**, **eklenti** ve **ayarlar** düğmeleri bulunur.
4. Geri / ileri gezinme (`Alt+←` / `Alt+→`) ve yenileme (`Alt+R`); sekme başına son 50 adım tutulur.
5. Tam ekran (`F11`): sistem çubuklarını gizler.
6. Okuma modu: sayfanın metnini kendi tipografisiyle gösterir (Android).
7. Boş alanda yazmaya başlamak doğrudan aramayı açar.
8. Ayarlar, GitHub, eklentiler ve bildirimler tam sayfa panel olarak açılır; `Esc` ile kapanır.
9. Son 200 siteyi tutan geçmiş; Ayarlar'dan temizlenir.
10. Animasyonlar kapatılabilir; uygulama arka plana geçince ışık animasyonu durur (pil ve GPU tasarrufu).

### Arama

11. Sonuçlar kendi arayüzünde listelenir ("Anfo" motoru).
12. Vikipedi özet kartı: sorguyla adı örtüşen ilk madde öne çıkar.
13. Android'de web sonuçları DuckDuckGo'dan, özetler Vikipedi'den gelir; web sürümünde Vikipedi sonuçları gösterilir (TR, gerekirse EN).
14. İsteğe bağlı olarak doğrudan Google, DuckDuckGo, Bing veya Brave'de aranabilir.
15. Yazarken öneriler (Ayarlar'dan kapatılabilir).
16. Arama sonuçları bellekte 10 dakika önbelleklenir (son 30 arama); geri / ileri ile dönülünce ağa gidilmez.

### Ana sayfa ve widget'lar

17. Saate göre selamlama, isteğe bağlı ad ve saat (üç stil: İki renk, İnce, Kalın).
18. Sabit siteler: 3–10 arası, daire, yumuşak ya da kare şekil; basılı tutarak ya da sağ tıklayarak kaldırılır.
19. Sabit listesine "+" ile site eklenir.
20. Hava durumu: Open-Meteo verisi, konum ya da seçilen şehre göre; saatlik ve 5 günlük tahmin, 20 dakika önbellek.
21. Odak sayacı: 15, 25 ya da 50 dakika odak, ardından 5 dakika mola; süre bitince bildirim gelir.
22. Hızlı notlar: yazılan not cihazda saklanır.
23. GitHub kartı: bağlıysa profil, okunmamış bildirim sayısı ve son iki depo.
24. İstatistik: engellenen istek, açık sekme ve geçmiş site sayısı.
25. Takvim: gün, ay ve yılın ilerlemesi.
26. Widget'lar Ayarlar'dan açılıp kapatılır ve sıralanır.

### GitHub arayüzü (kişisel erişim anahtarı ile)

27. Anahtar bağlanmadan önce doğrulanır ve yalnızca cihazda saklanır.
28. Profil: ad, kullanıcı adı, biyografi, takipçi, takip ve depo sayıları.
29. Akış: push, PR, issue, yıldız ve dal / etiket oluşturma etkinlikleri.
30. Depolar: dil, yıldız sayısı, son güncelleme; özel ve çatal etiketleri.
31. Bildirimler: okunmamışlar işaretli, depo ve tür bilgisiyle.
32. Bana atananlar: açık ya da kapalı issue ve PR'lar.
33. github.com açılınca Anfo'nun GitHub arayüzü açılır (Ayarlar'dan kapatılabilir).
34. Bildirimler arka planda periyodik olarak yoklanır.

### Bildirim merkezi

35. Kaynaklar: GitHub, odak sayacı ve sistem (bellek boşaltma) bildirimleri.
36. Gün başlığına göre gruplama (Bugün, Dün, tarih); açılınca bildirimler okunmuş sayılır.
37. Tek tek kaldırma ya da tümünü temizleme.

### Eklentiler

38. 11 yerleşik eklenti: Çerez bannerlarını gizle, YouTube odak, Video hız tuşu, Okuma ilerlemesi, Yapışkan üst bar serbest, Kopyalama serbest, Basit karanlık, Okunaklı metin, Reddit temiz, Otomatik oynatmayı durdur, Vikipedi temiz.
39. Kendi CSS ve JS eklentin: ad, uygulanacak siteler (boşsa tümü), aç / kapa, düzenle, sil.
40. Eklentiler yalnızca Android uygulamasında sayfalara uygulanır.

### Kısayollar

41. `yt kedi` yazılınca YouTube'da "kedi" aranır; `!yt kedi` biçimi de çalışır.
42. Hazır kısayollar: `yt` YouTube, `g` Google, `w` Vikipedi, `gh` GitHub, `m` Harita, `tr` Çeviri.
43. Kendi kısayolunu ekle (kısaltma, ad, adres; adreste `%s` olmalı) ya da mevcut olanı sil.

### Gizlilik ve kalkan

44. Reklam ve izleyici engelleme (Android). Engelleme listesi `public/blocklist.txt` dosyasındadır.
45. Kalkan site başına kapatılabilir; engellenen istek sayacı Ayarlar'da görünür.
46. Tüm veriler yalnızca cihazda, `localStorage` içinde tutulur; hesap ya da sunucu yoktur.
47. Anthropic ve GitHub anahtarları yalnızca cihazda saklanır ve yalnızca ilgili hizmete gönderilir.
48. Geçmişi temizleme ve ayarları sıfırlama.

### Performans ve bellek

49. Akıcılık profili: Yüksek, Dengeli ya da Tasarruf (Tasarruf: ışık sabit, buğu ve doku kapalı).
50. Bellekte tutulan sekme sayısı: 1, 2, 4 ya da 8; diğerleri uyutulur, seçilince yeniden yüklenir.
51. Arka plandaki sekmeyi 5, 15 ya da 30 dakika sonra uyutma ya da hiç uyutmama.
52. Android: görünmeyen WebView'lar duraklatılır (`onPause`, `pauseTimers`).
53. Bellek baskısında arka plan sekmeleri hemen uyutulur ve bildirim gönderilir.
54. Sayfa önbelleği modu: Normal, Agresif (önce önbellek) ya da Kapalı (Android).
55. Önbelleği temizleme ve arka plan sekmelerini elle uyutma.
56. Bağlantı ön-ısıtma: bağlantının üzerine gelince ya da dokunulunca sunucuya önceden bağlanılır.
57. Görselleri yüklememe (veri tasarrufu) ve hafif mod: web fontları ile sayfa animasyonları kapalı (Android).
58. Web sürümünde uygulama kabuğu servis çalışanı ile önbelleğe alınır; ikinci açılış ağ beklemez.
59. Liste kartları (GitHub, bildirim, eklenti) ekran dışındayken çizilmez (`content-visibility`).
60. Performans kartı: bellekte kaç sekme olduğu ve kullanılan bellek (Android'de cihazdaki boş bellek).

### Özelleştirme

61. 10 hazır tema: Kiraz, Gece yarısı, Şarap, Gül kurusu, Kehribar, Lavanta, Okyanus, Orman, Monokrom, Neon.
62. Vurgu rengi: 7 hazır renk ya da özel renk seçici; ton kayması 0–120°.
63. Atmosfer: Ufuk, Aurora, Küre ya da Yalın; ışık gücü ve ışık hızı ayarları.
64. Doku ve buğu miktarı.
65. Yazı tipi: Sora, Manrope, Space Grotesk ya da sistem yazı tipi.
66. Köşe yumuşaklığı ve arayüz ölçeği.
67. Ada genişliği ve konumu (altta ya da üstte).
68. Ana sayfa: saat stili, hizalama (orta ya da sol), sabit şekli ve sabit sayısı.
69. Duvar kâğıdı (yerel görsel) ve karartma oranı.
70. Açılış sayfası: son oturum ya da ana sayfa.
71. Ses paketleri: Derin, Kadife, Buz; düzey ayarı. Sesler Web Audio ile sentezlenir.
72. Dokunsal geri bildirim (destekleyen cihazlarda).

### AI modu

73. Arama sonuçlarının üstünde kaynak numaralı kısa özet.
74. Android: yay menüsündeki "AI özeti" açık sayfayı özetler.
75. İki çalışma biçimi (Ayarlar › AI modu):
    - **Cihazda (varsayılan, ücretsiz):** kullanıcının isteğiyle indirilen, 4 bit nicemlenmiş, 800M parametrenin altındaki küçük bir model tarayıcının içinde çalışır (transformers.js + ONNX Runtime Web; WebGPU varsa GPU, yoksa WASM). Seçenekler: Qwen3 0.6B (önerilen), Qwen2.5 0.5B, Gemma 3 270M. Modeller Hugging Face'ten bir kez indirilir, cihazda (`transformers-cache`) saklanır, Ayarlar'dan silinebilir; sorgular hiçbir AI sunucusuna gönderilmez. Model ayrı bir Web Worker'da çalıştığı için arayüz donmaz.
    - **Claude (API anahtarı):** anahtar kullanıcı tarafından girilir, yalnızca cihazda saklanır; model `claude-opus-5-5`.

### Klavye kısayolları

| Kısayol | İşlem |
| --- | --- |
| `Ctrl+L` / `Ctrl+K` | Ara |
| `Alt+T` | Yeni sekme |
| `Alt+W` | Sekmeyi kapat |
| `Alt+←` / `Alt+→` | Geri / ileri |
| `Alt+R` | Yenile |
| `Alt+N` | Bildirimler |
| `Alt+G` | GitHub |
| `Alt+E` | Eklentiler |
| `Ctrl+,` | Ayarlar |
| `F11` | Tam ekran |

## Platform notu

Kalkan, hafif mod, görselleri kapatma, sayfa karartma, masaüstü görünümü, okuma modu, tam ekran ve uyuyan sekmeler **yalnızca Android'de çalışır**. Android'de her sekme gerçek bir Android WebView'da açılır (`android/app/src/main/java/app/anfo/browser/WebTabsPlugin.java`). Web sürümü sayfaları iframe içinde açar; bu nedenle çerçevelenmeyi engelleyen siteler web sürümünde açılmayabilir.

Tüm veriler (sekmeler, geçmiş, sabitler, ayarlar) yalnızca cihazda, `localStorage` içinde tutulur.

## Klasör yapısı

| Yol | İçerik |
| --- | --- |
| `src/` | React kaynak kodu (`store.js`: durum ve yerel köprü, `components/`: arayüz bileşenleri) |
| `public/` | Statik dosyalar (`blocklist.txt`, simgeler, manifest) |
| `assets/` | Anfo logosunun özgün dosyası |
| `android/` | Capacitor Android projesi |
| `yayin/web/` | Yayına hazır statik web dosyaları. Herhangi bir statik sunucuya yüklenebilir; `base` değeri `./` olduğu için alt dizinde de çalışır |
| `yayin/Anfo.apk` | Derlenmiş Android APK'sı (debug imzalı, telefona doğrudan kurulabilir) |

## Geliştirme

```bash
npm install
npm run dev        # geliştirme sunucusu
npm run build      # web çıktısı -> dist/
npm run android    # vite build && cap sync android
```

APK derlemek için (JDK ve Android SDK gerekir):

```bash
cd android
gradlew.bat assembleDebug
```

## Yayın notu

`yayin/Anfo.apk` debug anahtarıyla imzalıdır. Telefona doğrudan kurulabilir, ancak Play Store'a yüklemek için kendi anahtarınızla imzalanmış bir release derlemesi gerekir.
