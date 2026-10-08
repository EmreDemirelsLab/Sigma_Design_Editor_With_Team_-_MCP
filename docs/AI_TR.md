# AI yardımcısı

## Sağlayıcılar

OpenAI uyumlu Chat Completions:

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=ACCOUNT_AVAILABLE_MODEL_ID
AI_API_KEY='YOUR_KEY'
```

Anthropic Messages:

```dotenv
AI_PROVIDER=anthropic
AI_BASE_URL=https://api.anthropic.com/v1
AI_MODEL=ACCOUNT_AVAILABLE_MODEL_ID
AI_API_KEY='YOUR_KEY'
```

Açık model veya farklı sağlayıcı için OpenAI uyumlu URL kullanılabilir. Gateway `max_completion_tokens` gönderir; sunucun yalnızca `max_tokens` kabul ediyorsa adapter değişikliği gerekir. Her model JSON talimatını izlemeyebilir; schema validator geçmeyen cevap tuvale uygulanmaz. Model adı ve fiyatları sağlayıcı hesabından doğrula; repo herhangi bir modelin hesabında bulunduğunu varsaymaz.

Yerel model için `AI_ALLOW_HTTP=true` ve Docker ağından erişilebilir `AI_BASE_URL=http://HOST:PORT/v1` kullanılabilir. Konteyner içindeki `localhost` VPS'in kendisi değildir. HTTP seçeneği yalnızca güvendiğin özel ağ içindir.

## Kişisel AI erişimi

```bash
python3 scripts/ai-user.py emre
python3 scripts/ai-user.py teammate
docker compose up -d --force-recreate sigma-assistant
```

Bu anahtarlar AI harcaması için ayrı bearer token’lardır; Penpot üyeliğine otomatik bağlı değildir. Ekipten birini çıkardığında hem Penpot üyeliğini hem AI anahtarını iptal et:

```bash
python3 scripts/ai-user.py teammate --revoke
docker compose up -d --force-recreate sigma-assistant
```

Aynı kullanıcı için komutu yeniden çalıştırmak eski AI anahtarını geçersiz kılar. Anahtar tarayıcı panelinde bellekte tutulur; localStorage'a yazılmaz. Paneli kapatınca yeniden girmen gerekir. Anahtarı özel bir kanaldan ilet.

Saatlik sınır `AI_REQUESTS_PER_HOUR=20`, eşzamanlılık `AI_MAX_CONCURRENT=2`. Sınırlar süreç belleğindedir, yeniden başlatmada sıfırlanır. Tek instance içindir; sağlayıcı hesabında ayrıca bütçe limiti koy. Bu sayaç faturalandırma sistemi değildir.

## Tasarım güvenliği ve sınırlar

- AI yanıtında JavaScript çalıştırılmaz. Sadece sınırları doğrulanmış JSON çizim planı uygulanır.
- Mevcut dosyayı silmez; yeni board ekler. Hata oluşursa kısmi board kaldırılır.
- Seçili nesnelerin ad/tür/konum/boyut bilgileri kullanıcı bağlam eklediğinde paylaşılır; tüm dosya gönderilmez.
- Model ekranı metin, dikdörtgen ve elips ile kurar. Görsel üretimi, zengin component/variant oluşturma ve mevcut tasarımı kapsamlı dönüştürme panelde yoktur. Bunlar resmi MCP ajan akışıyla geliştirilebilir.
- Önizleme basit SVG'dir; Penpot metin ölçümü/font farklarını tuvalde kontrol et.
- Model çıktısı en fazla 180 nesne, 4096×8192 board boyutu ile sınırlıdır.
- AI anahtarı sahibi sağlayıcı kotanı kullanabilir; gizli tut ve gerekirse iptal et.

Kaynak: Sigma uygulaması (`apps/assistant`, `shared`), 8 Ekim 2026. Gerçek sağlayıcı çağrıları bu geliştirme ortamında yapılmadı.
