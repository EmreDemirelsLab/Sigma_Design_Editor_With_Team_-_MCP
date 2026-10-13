# Sigma Headless MCP

Tarayıcısız, çok dosyalı Penpot tasarım ajanı sunucusu. Penpot'un resmi MCP'sinden farkı: tasarımı **açık bir editör sekmesi üzerinden değil, doğrudan Penpot arka uç API'siyle** okur ve değiştirir. Sekme kapalıyken, bilgisayar uykudayken, CI içinde çalışır; ajan dosya kimliğiyle her projeye erişir.

- Kod: MIT, Sigma'ya ait (`apps/mcp-headless`). Penpot'un hiçbir dosyası değiştirilmez.
- Yığın: Node 22 + `@modelcontextprotocol/sdk` (Streamable HTTP, durumsuz) + zod. Bağımlılık yok (Postgres'e dokunmaz; yalnız RPC).
- Kimlik: Penpot'ta `sigma-agent@sigma.local` servis hesabı + erişim anahtarı (`SIGMA_AGENT_TOKEN`). Sunucunun kendi anahtarı `SIGMA_MCP_KEY` (Bearer). Yalnız Tailscale IP'sine yayınlanır (`SIGMA_MCP_BIND`).
- Hız: dosya önbelleği (4 sn), keep-alive, toplu oluşturma tek revizyonda. Tipik araç 200-400 ms (Tailscale üzerinden); PNG ekran görüntüsü ~3 sn, ekran görüntülü tasarım bağlamı ~4-5 sn (Penpot exporter Chromium).
- Kararlılık: revizyon çakışmasında otomatik yeniden deneme, 30 sn RPC zaman aşımı, `/health`, salt okunur konteyner, 384 MB bellek sınırı.

## Araçlar (47)
Figma'nın MCP'sindeki okuma araçlarının birebir karşılıkları ve Figma'da olmayan tasarım kalitesi araçları vardır.

| Figma MCP | Sigma Headless | Ne döndürür |
|---|---|---|
| `get_design_context` | `penpot_get_design_context` | React+Tailwind (ya da HTML+CSS) kodu, `data-node-id`, renkler (kütüphane adlarıyla), fontlar, PNG. Düğüm çok büyükse taslağa düşer. |
| `get_metadata` | `penpot_get_metadata` | Seyrek XML taslak (id, ad, tür, x, y, w, h). |
| `get_screenshot` | `penpot_get_screenshot` | Otomatik ölçekli PNG. |
| `get_variable_defs` | `penpot_get_variable_defs` | Kullanılan renk/tipografi/boşluk/köşe/kontur + kütüphane. |
| `search_design_system` | `penpot_search_design_system` | Dosya ve bağlı kütüphanelerde bileşen/renk/tipografi araması. |
| `use_figma` (yazma) | `penpot_batch_create`, `penpot_batch_update`, `penpot_create_path`, `penpot_create_component`, `penpot_instantiate_component` | Tek revizyonda toplu oluşturma/düzenleme. |

**Tasarım kalitesi (v0.3)**
- **Denetçi** `penpot_lint_design`: WCAG kontrast, metin taşması/çakışması, sınır dışı katman, 4/8px ızgara, neredeyse-hiza, boşluk ölçeği, font/renk dağınıklığı, küçük metin, mobil dokunma alanı (44px), logo için ince kontur. 0-100 skor + katman kimliği + somut düzeltme.
- **Gerçek metin ölçümü** (fontkit, Penpot'un Google Fonts vekili; latin + latin-ext, Türkçe karakterler): metin genişliği/satır kırma/positionData editör açılmadan doğru.
- **Sunucu tarafı flex yerleşim** (Yoga): `penpot_apply_layout`; toplu oluşturma ve güncellemeler flex board'ları otomatik yerleştirir.
- **Logo**: `penpot_create_primitive` (çokgen, yıldız, halka, dilim, yay, squircle, çizgi), `penpot_boolean` (union/subtract/intersect/exclude, paper.js), `penpot_text_to_path` (kerning'li kelime markası), `penpot_export_logo_pack` (16→1024px).
- **İkon ve görsel**: `penpot_search_icons` / `penpot_insert_icon` (1.877 Lucide ikonu, hepsi test edildi), `penpot_insert_image` (URL'den bitmap).
- **Parçacık çizimi** `penpot_create_dot_art`: ikon/yol/hazır şekilden (globe, enso, galaxy…) katmanlı, parlayan nokta bulutu — premium AI sitelerinin görsel dili.
- **Marka kiti** `penpot_create_brand_kit`: tek renkten OKLCH rampaları (50-950), nötr rampa, durum renkleri, modüler tipografi ölçeği → kütüphane + stil sayfası.
- **Şablonlar**: `penpot_create_device_frame` (iPhone 16/Pro Max/SE, Android, iPad, tablet, laptop, desktop, mobil web; ızgara + güvenli alanlar), `penpot_insert_web_section` (navbar, hero + ürün paneli önizlemesi, logo-cloud, features, pricing, testimonial, cta, footer, koyu parçacıklı `scene-hero` / `scene`), `penpot_insert_app_component` (app-bar, tab-bar, button, text-field, list-item, card, search-bar).
- **Prototip** `penpot_link_screens`: tıklama/hover/gecikme ile ekran geçişi ve animasyon.
- **Efektler**: degrade, gölge, bulanıklık, kontur stili/hizası, flex çocuk boyutlandırma ve kenar boşluğu — oluşturma ve güncelleme araçlarında.
- **MCP istemleri** (Claude Code ve Codex): `sigma_design_logo`, `sigma_design_web_page`, `sigma_design_app_screen`, `sigma_design_review` — uzman süreci + kalite döngüsü.

## Doğruluk ve eşzamanlılık
- Penpot'un JSON API'si mod-obj değerlerini şemadan geçirmez (enum, UUID, selrect/points). `normalizeChanges` bu değişiklikleri otomatik olarak aynı kimlikle yeniden ekleme biçimine çevirir; aynı toplu işte yeni eklenen şekillere ait güncellemeler doğrudan add-obj'a katılır.
- Her yazma, önbellek değil **taze** dosya üzerinden hesaplanır; yalnız istenen alanlar gönderilir. Bir insan aynı anda düzenlerken diğer alanlar ezilmez.
- Metinde yalnız stil (renk, ağırlık, harf aralığı…) değişirse karışık stilli parçalar korunur; `text` verilirse metin tek stille yeniden kurulur.
- Yalnız gerçek revizyon çakışması bir kez yeniden denenir; şema hataları yeniden denenmez.
- Yollar ve bool şekiller için sınır kutusu `selrect`/`points` üzerinden okunur (eskiden 0×0 görünüyordu).

## Bilinen sınırlar (Penpot 2.18.3)
- Koordinatlar sayfa mutlak pikselidir; çocuklar üst öğeye göreli değildir. `penpot_get_design_context` çıktısında ise konumlar üst öğeye göreli px'tir.
- Flex auto-layout akışı editör dosyayı açınca uygulanır; çocuklara yine makul mutlak konum ver. Toplu oluşturmada op sırası = görsel sıra.
- Metnin kesin satır yerleşimi (`positionData`) editörde hesaplanır. Bu yüzden editörde hiç açılmamış metin içeren board'ların **SVG** dışa aktarımı Penpot exporter'ında zaman aşımına düşer; araç bunu hızlıca açıklayan bir hata döndürür. **PNG ve ekran görüntüsü her durumda çalışır.**
- Döndürülmüş şekillerde geometri güncellemesi kapalı (ham `attrs` ile yapılabilir).
- Grid layout oluşturma henüz yok (mevcut grid layout'lar okunur ve koda çevrilir); flex tam desteklenir.
- Kod çıktısında konturlar CSS `outline` ile Penpot hizalamasına (center/inner/outer) göre verilir; içe aktarılmış ham SVG (`svg-raw`) katmanları için `penpot_export` kullanılır.

## Güvenlik
- Konteyner yalnız kendi değişkenlerini alır (`PENPOT_PUBLIC_URI`, `SIGMA_AGENT_*`, `SIGMA_MCP_KEY`); veritabanı parolası, Penpot gizli anahtarı, AI ve SMTP sırları konteynere girmez.
- Bearer anahtarı sabit zamanlı karşılaştırılır ve loglanmaz. Sağlık kontrolü log üretmez.

## Çalıştırma
Compose servisi `sigma-mcp-headless` (`/srv/sigma/compose.yaml`). Güncelleme: `docker compose build sigma-mcp-headless && docker compose up -d sigma-mcp-headless`. Sağlık: `curl http://<tailscale-ip>:4410/health`.
Duman testi: `MCP_URL=http://<tailscale-ip>:4410/mcp MCP_KEY=<SIGMA_MCP_KEY> node scripts/smoke.mjs` (yeni bir dosya oluşturur).

## İstemci (Claude Code)
```bash
claude mcp add --transport http sigma-headless http://<tailscale-ip>:4410/mcp --header "Authorization: Bearer <SIGMA_MCP_KEY>"
```
