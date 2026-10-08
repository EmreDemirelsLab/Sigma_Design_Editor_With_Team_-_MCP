# Claude Code ve Codex bağlantısı

Penpot 2.18.3 resmi MCP servisi Compose içinde `penpot-mcp` olarak çalışır. Nginx ve Caddy üzerinden aynı domain `/mcp/` yoluna yönlenir. Ek AI API anahtarı girmen gerekmez; Claude Code/Codex'in kendi erişim ve ücretlendirmesi kullanılır.

1. Hesap → Integrations → MCP Server → Enable.
2. MCP anahtarını oluştur. Bir kez gösterilir.
3. Arayüzde verilen URL’yi **aynen** kopyala. Penpot kullanıcı token'ını Sigma AI paneline girme.
4. Dosya aç → File → MCP Server → Connect.
5. İstemcinin MCP ayarına HTTP/remote server olarak URL’yi ekle.

Penpot'un resmi kurulum yardımcısı (Node.js ve npx gerekir):

```bash
npx -y add-mcp -g -n sigma 'URL_FROM_PENPOT_INTEGRATIONS'
```

İnteraktif seçimde kullandığın istemciyi (Claude Code/Codex) seç. URL token içerir; terminal geçmişi veya ekran paylaşımında görünmemesine dikkat et. İstemcinin güncel arayüzü üzerinden URL eklemek de mümkündür. `.mcp.json` veya Codex config dosyasına gerçek token ekleyip repoya commit etme.

## Kabul denemesi

- “Açık dosyanın sayfalarını ve seçili katmanlarını listele.”
- “Yeni bir board oluştur, içine bir başlık ve iki kart ekle.”
- “Bu board’daki kartların aralığını 24 piksel yap.”
- “Bu tasarımın yapısını React bileşenlerine dönüştür; kodu ayrı proje dosyalarına yaz.”

İlk üç işlem editörde görünmeli; son işlem için ajanının yerel projeye dosya erişimi olması gerekir. MCP’nin her komutu başarıyla tasarıma dönüştüreceği garantisi yoktur; ajan/model ve bağlam kalitesi önemlidir.

MCP açık/odaklı sayfayı kullanır; bir aktif MCP sekmesi vardır. Sekme askıya alınırsa yeniden odakla ve bağlan. AI ajanı silme dahil değişiklik yapabilir; önce küçük denemeler yap, tasarım geçmişini kullan. Bir ekipte her üyenin kendi MCP anahtarı olmalı.

Kaynak: [Resmi Penpot MCP dokümantasyonu](https://help.penpot.app/mcp/), kontrol 8 Ekim 2026. Gerçek Claude Code/Codex oturumu bu ortamda açılmadı.
