# Sigma Headless MCP

Tarayıcısız, çok dosyalı Penpot tasarım ajanı sunucusu. Penpot'un resmi MCP'sinden farkı: tasarımı **açık bir editör sekmesi üzerinden değil, doğrudan Penpot arka uç API'siyle** okur ve değiştirir. Sekme kapalıyken, bilgisayar uykudayken, CI içinde çalışır; ajan dosya kimliğiyle her projeye erişir.

- Kod: MIT, Sigma'ya ait (`apps/mcp-headless`). Penpot'un hiçbir dosyası değiştirilmez.
- Yığın: Node 22 + `@modelcontextprotocol/sdk` (Streamable HTTP, durumsuz) + zod. Bağımlılık yok (Postgres'e dokunmaz; yalnız RPC).
- Kimlik: Penpot'ta `sigma-agent@sigma.local` servis hesabı + erişim anahtarı (`SIGMA_AGENT_TOKEN`). Sunucunun kendi anahtarı `SIGMA_MCP_KEY` (Bearer). Yalnız Tailscale IP'sine yayınlanır (`SIGMA_MCP_BIND`).
- Hız: dosya önbelleği (4 sn), keep-alive, toplu oluşturma tek revizyonda. Tipik araç 110-300 ms; PNG dışa aktarma ~4 sn (Penpot exporter Chromium).
- Kararlılık: revizyon çakışmasında otomatik yeniden deneme, 30 sn RPC zaman aşımı, `/health`, salt okunur konteyner, 384 MB bellek sınırı.

## Araçlar (23)
Keşif: `penpot_list_teams`, `penpot_list_projects`, `penpot_list_files`, `penpot_file_overview`, `penpot_page_tree`, `penpot_get_shape`, `penpot_find_shapes`, `penpot_file_assets`, `penpot_file_url`
Sayfa: `penpot_create_page`, `penpot_rename_page`, `penpot_delete_page`, `penpot_create_file`
Oluşturma: `penpot_create_board` (flex auto-layout seçenekli), `penpot_create_rectangle`, `penpot_create_ellipse`, `penpot_create_text`, `penpot_batch_create` (bir ekranı tek revizyonda kur)
Düzenleme: `penpot_update_shape` (konum/boyut, renk, kontur, köşe, metin ve stili, layout, ham attrs), `penpot_move_shapes`, `penpot_delete_shapes`
Güvenlik/çıktı: `penpot_snapshot` (geri dönüş noktası), `penpot_export` (PNG görsel / SVG)

## Bilinen sınırlar (Penpot 2.18.3)
- Koordinatlar sayfa mutlak pikselidir; çocuklar üst öğeye göreli değildir.
- Flex auto-layout akışı editör dosyayı açınca uygulanır; o yüzden çocuklara yine makul mutlak konum ver. Toplu oluşturmada op sırası = görsel sıra.
- Metin katmanlarının kesin yerleşimi (`positionData`) editör tarafından hesaplanır; dışa aktarmada metin genişliği tahminidir. Metin içeren board'ların **SVG** dışa aktarımı exporter'da zaman aşımına düşer → PNG kullan. Şekil/board SVG'si çalışır.
- Döndürülmüş şekillerde geometri güncellemesi kapalı (ham `attrs` ile yapılabilir).
- Bileşen örneği (component instance) oluşturma ve yol (path) çizimi v1'de yok.

## Çalıştırma
Compose servisi `sigma-mcp-headless` (`/srv/sigma/compose.yaml`). Güncelleme: `docker compose build sigma-mcp-headless && docker compose up -d sigma-mcp-headless`. Sağlık: `curl http://<tailscale-ip>:4410/health`.
Duman testi: `MCP_URL=http://<tailscale-ip>:4410/mcp MCP_KEY=<SIGMA_MCP_KEY> node scripts/smoke.mjs` (yeni bir dosya oluşturur).

## İstemci (Claude Code)
```bash
claude mcp add --transport http sigma-headless http://<tailscale-ip>:4410/mcp --header "Authorization: Bearer <SIGMA_MCP_KEY>"
```
