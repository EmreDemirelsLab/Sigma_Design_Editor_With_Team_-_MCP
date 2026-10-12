# Sigma Headless MCP

Tarayıcısız, çok dosyalı Penpot tasarım ajanı sunucusu. Penpot'un resmi MCP'sinden farkı: tasarımı **açık bir editör sekmesi üzerinden değil, doğrudan Penpot arka uç API'siyle** okur ve değiştirir. Sekme kapalıyken, bilgisayar uykudayken, CI içinde çalışır; ajan dosya kimliğiyle her projeye erişir.

- Kod: MIT, Sigma'ya ait (`apps/mcp-headless`). Penpot'un hiçbir dosyası değiştirilmez.
- Yığın: Node 22 + `@modelcontextprotocol/sdk` (Streamable HTTP, durumsuz) + zod. Bağımlılık yok (Postgres'e dokunmaz; yalnız RPC).
- Kimlik: Penpot'ta `sigma-agent@sigma.local` servis hesabı + erişim anahtarı (`SIGMA_AGENT_TOKEN`). Sunucunun kendi anahtarı `SIGMA_MCP_KEY` (Bearer). Yalnız Tailscale IP'sine yayınlanır (`SIGMA_MCP_BIND`).
- Hız: dosya önbelleği (4 sn), keep-alive, toplu oluşturma tek revizyonda. Tipik araç 200-400 ms (Tailscale üzerinden); PNG ekran görüntüsü ~3 sn, ekran görüntülü tasarım bağlamı ~4-5 sn (Penpot exporter Chromium).
- Kararlılık: revizyon çakışmasında otomatik yeniden deneme, 30 sn RPC zaman aşımı, `/health`, salt okunur konteyner, 384 MB bellek sınırı.

## Araçlar (32) — Figma Dev Mode MCP karşılıkları ile
Figma'nın MCP'sindeki okuma araçlarının birebir karşılıkları vardır; ajan bir tasarımı kod gibi okuyup aynı dosyaya yazabilir.

| Figma MCP | Sigma Headless | Ne döndürür |
|---|---|---|
| `get_design_context` | `penpot_get_design_context` | React+Tailwind (ya da HTML+CSS) kodu, `data-node-id` ile katman eşlemesi, kullanılan renkler (kütüphane adlarıyla) ve fontlar, PNG ekran görüntüsü. Düğüm çok büyükse taslağa düşer. |
| `get_metadata` | `penpot_get_metadata` | Seyrek XML taslak: her katmanın id, ad, tür, x, y, genişlik, yükseklik. Büyük sayfalarda düğüm bulmak için. |
| `get_screenshot` | `penpot_get_screenshot` | Uzun kenarı ~1600 px olacak şekilde otomatik ölçekli PNG. |
| `get_variable_defs` | `penpot_get_variable_defs` | Kullanılan renk, tipografi, boşluk, köşe, kontur değerleri ve kütüphane renk/tipografi/tokenları. |
| `search_design_system` | `penpot_search_design_system` | Bu dosya ve bağlı kütüphanelerde bileşen/renk/tipografi araması. |
| `use_figma` (yazma) | `penpot_batch_create`, `penpot_batch_update`, `penpot_create_path`, `penpot_create_component`, `penpot_instantiate_component` | Tek revizyonda toplu oluşturma/düzenleme, SVG yol çizimi, bileşen yapma ve kopyalama. |

Tam liste:
- Keşif: `penpot_list_teams`, `penpot_list_projects`, `penpot_list_files`, `penpot_file_overview`, `penpot_page_tree` (gerçek sınır kutusu, dolgu, kontur, köşe, font, yerleşim), `penpot_get_shape`, `penpot_find_shapes`, `penpot_file_assets`, `penpot_file_url`
- Tasarım bağlamı: `penpot_get_design_context`, `penpot_get_metadata`, `penpot_get_screenshot`, `penpot_get_variable_defs`, `penpot_search_design_system`
- Sayfa: `penpot_create_page`, `penpot_rename_page`, `penpot_delete_page`, `penpot_create_file`
- Oluşturma: `penpot_create_board` (flex), `penpot_create_rectangle`, `penpot_create_ellipse`, `penpot_create_text` (`runs` ile tek katmanda karışık renk/ağırlık/font, `\n` ile paragraf), `penpot_create_path` (her SVG `d`: M L H V C S Q T A Z, göreli/mutlak), `penpot_batch_create` (board/rect/ellipse/text/path)
- Bileşen: `penpot_create_component` (şekli yerinde ana bileşene çevirir), `penpot_instantiate_component` (bu dosyadan ya da bağlı kütüphaneden kopya)
- Düzenleme: `penpot_update_shape`, `penpot_batch_update` (yüzlerce şekil tek revizyonda), `penpot_move_shapes`, `penpot_delete_shapes`
- Güvenlik/çıktı: `penpot_snapshot`, `penpot_export` (PNG/SVG; render-wasm dosyalarda önce WASM, olmazsa klasik)

## Doğruluk ve eşzamanlılık
- Her yazma, önbellek değil **taze** dosya üzerinden hesaplanır; yalnız istenen alanlar gönderilir. Bir insan aynı anda düzenlerken diğer alanlar ezilmez.
- Metinde yalnız stil (renk, ağırlık, harf aralığı…) değişirse karışık stilli parçalar korunur; `text` verilirse metin tek stille yeniden kurulur.
- Yalnız gerçek revizyon çakışması bir kez yeniden denenir; şema hataları yeniden denenmez.
- Yollar ve bool şekiller için sınır kutusu `selrect`/`points` üzerinden okunur (eskiden 0×0 görünüyordu).

## Bilinen sınırlar (Penpot 2.18.3)
- Koordinatlar sayfa mutlak pikselidir; çocuklar üst öğeye göreli değildir. `penpot_get_design_context` çıktısında ise konumlar üst öğeye göreli px'tir.
- Flex auto-layout akışı editör dosyayı açınca uygulanır; çocuklara yine makul mutlak konum ver. Toplu oluşturmada op sırası = görsel sıra.
- Metnin kesin satır yerleşimi (`positionData`) editörde hesaplanır. Bu yüzden editörde hiç açılmamış metin içeren board'ların **SVG** dışa aktarımı Penpot exporter'ında zaman aşımına düşer; araç bunu hızlıca açıklayan bir hata döndürür. **PNG ve ekran görüntüsü her durumda çalışır.**
- Döndürülmüş şekillerde geometri güncellemesi kapalı (ham `attrs` ile yapılabilir).
- Görsel (bitmap) yükleme ve grid layout oluşturma henüz yok; mevcut grid layout'lar okunur ve koda çevrilir.
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
