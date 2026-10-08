# Sigma Design Workspace

Kendi sunucunda çalışan ekip tasarım alanı + Claude Code/Codex MCP + sade AI tasarım yardımcısı.

## Ne kurulur?

- **Penpot 2.18.3:** vektör editörü, ekipler, ortak dosyalar, gerçek zamanlı çalışma, bileşenler, prototipleme.
- **Resmi Penpot MCP:** AI ajanlarının açık dosyayı okuyup düzenlemesi. Özel bir taklit MCP sunucusu değildir.
- **Sigma eklentisi:** Türkçe, sade panel; prompt → AI planı → önizleme → düzenlenebilir yeni ekran. Metin, dikdörtgen ve elips üretir.
- **AI gateway:** OpenAI uyumlu Chat Completions veya Anthropic Messages API. Sunucuda model seçimi, kişisel erişim anahtarları, saatlik sınır ve eşzamanlılık sınırı.
- **Caddy:** tek alan adı altında HTTPS, Penpot ve Sigma yönlendirmesi.
- Kalıcı PostgreSQL/asset volume’ları, yedek/geri yükleme araçları ve CI kontrolleri.

**Kapsam:** Bu repo Penpot tabanlı kurulum ve Sigma eklentisidir; tüm Penpot kaynak kodunu yeniden yazan veya ana editör menülerini kaldıran bir fork değildir. Sade deneyim Sigma panelinde sağlanır; ana editör Penpot olarak kalır. AI paneli yeni ekran oluşturur; mevcut tasarımı kapsamlı düzenleme resmi MCP üzerinden yapılır. AI tasarımlarının kalite ve kod dönüşümü için insan incelemesi gerekir.

## Yerel başlatma

Docker Engine/Desktop + Docker Compose v2 ve Python 3 gerekir.

```bash
git clone https://github.com/EmreDemirelsLab/Sigma_Design_Editor_With_Team_-_MCP.git
cd Sigma_Design_Editor_With_Team_-_MCP
python3 scripts/setup.py
bash scripts/up.sh
```

- Editör: <http://localhost:8080>
- Sigma başlangıç sayfası: <http://localhost:8080/sigma/>
- Yerel e-posta kutusu: <http://localhost:1080> (sadece aynı makinede)
- İlk hesabı oluştur; bir ekip ve proje aç; ekip üyelerini davet et. Yerel davet e-postaları mailcatcher’da görünür.

## Kendi sunucunda çalıştırma

[Adım adım sunucu kurulumu](docs/DEPLOYMENT_TR.md) — alan adı, SMTP, ilk kullanıcı, ekipler ve yedekler.

```bash
python3 scripts/setup.py --domain design.example.com --email admin@example.com
# .env içine gerçek SMTP ve isteğe bağlı AI sağlayıcısı bilgilerini yaz.
bash scripts/up.sh
```

Alan adı/SMTP/API anahtarları kullanıcı tarafından sağlanır. Sunucuya bağlantı veya otomatik üretim yayını bu repo hazırlığının parçası değildir.

## AI paneli

`.env` içinde `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` alanlarını yapılandır. Model ID'sini sağlayıcının güncel hesabından al; repo model adını tahmin etmez.

```bash
python3 scripts/ai-user.py emre
docker compose up -d --force-recreate sigma-assistant
```

Verilen **kişisel AI anahtarını** panelde kullan. Bu anahtar Penpot parolası/MCP anahtarı değildir. Plugins → Load from URL:

```text
https://design.example.com/sigma/plugin/manifest.json
```

Yerelde `http://localhost:8080/sigma/plugin/manifest.json`. Eklentiyi aç, anahtarı gir, seçim bağlamını yükle (boş seçim kullanılabilir), isteğini yaz, oluştur, önizlemeyi incele, tuvale ekle. Yeni ekran Penpot nesneleridir; bir PNG değildir. Tek geri alma adımıyla kaldırılır. Metin önizlemesi ile Penpot'taki font/taşma farklılıklarını kontrol et.

Detay: [AI yapılandırma ve erişim](docs/AI_TR.md).

## Claude Code / Codex MCP

1. Penpot: Hesap → Integrations → MCP Server → Enable.
2. Kişisel MCP anahtarı oluştur; arayüzde gösterilen URL’yi kopyala.
3. MCP destekli istemcine bu URL’yi ekle. URL genellikle `https://design.example.com/mcp/stream?userToken=…` biçimindedir.
4. Bir dosya aç: File → MCP Server → Connect.
5. Ajanına “Bu sayfadaki katmanları listele” de. Sonra “Seçili kartların boşluklarını düzenle” gibi bir işlem dene.

Sekme çalışır durumda kalmalı. MCP odaklı sayfayı kullanır. Ayrıntı: [MCP rehberi](docs/MCP_TR.md).

## Doğrulama ve durum

```bash
npm run build
npm run check
npm test
python3 scripts/preflight.py
docker compose config --quiet
```

8 Ekim 2026: 11 Node testi ve JS sözdizimi kontrolleri yerel ortamda geçti. Bu ortamda Docker daemon/CLI bulunmadığından tam Penpot konteynerleri, gerçek sağlayıcı API çağrısı, tarayıcı plugin API ve gerçek ekip/MCP oturumu canlı doğrulanmadı. CI, Compose yapılandırmasını, Sigma Docker build’ini ve Caddy config’ini doğrular; bu da tam sistem E2E testi yerine geçmez. [Sunucuda kabul kontrolü](docs/ACCEPTANCE_TR.md) canlı doğrulamanın kalan adımlarını içerir.

## Kaynak ve lisans

Penpot kaynakları MPL-2.0 lisansına tabidir. Sigma'nın yeni kodu MIT; [LICENSE](LICENSE). Upstream Compose ve lisans `vendor/penpot/` içinde saklanır. Penpot’un marka/adı ile Sigma katmanı birbirinden ayrıdır.

Resmi kaynaklar (kontrol: **8 Ekim 2026**):

- [Penpot 2.18.3 sürümü](https://github.com/penpot/penpot/releases/tag/2.18.3)
- [Bu sürümün resmi Docker Compose dosyası](https://github.com/penpot/penpot/blob/2.18.3/docker/images/docker-compose.yaml)
- [Penpot self-host rehberi](https://help.penpot.app/technical-guide/getting-started/)
- [Resmi MCP rehberi](https://help.penpot.app/mcp/)
- [Plugin API](https://doc.plugins.penpot.app/)
- [Plugin oluşturma rehberi](https://help.penpot.app/plugins/create-a-plugin/)

Mimari, uygulama kapsamı ve test sonuçları bu repo geliştirmesine aittir (8 Ekim 2026).
