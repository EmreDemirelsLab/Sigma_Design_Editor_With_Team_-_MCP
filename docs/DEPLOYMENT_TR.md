# Sunucu kurulumu

Bu rehber yeni bir Linux VPS içindir. Var olan PostgreSQL veya sitelerin volume/portlarına müdahale etmez. Docker Engine ve Compose v2'yi işletim sistemine uygun resmi Docker kurulumuyla hazırla. Küçük ekip için 4 CPU / 8 GB RAM / SSD benim başlangıç kapasite önerimdir; ölçülmüş bir minimum veya performans garantisi değildir.

## 1. DNS ve ağ

- `design.example.com` için A kaydı sunucu IPv4 adresini göstersin.
- AAAA kullanıyorsan gerçekten çalışan IPv6 adresini gir; eski AAAA kaydını bırakma.
- Sunucuda 80 ve 443 TCP açık olmalı. SSH portunu koru.
- Başka bir reverse proxy bu portları kullanıyorsa Caddy'yi aynı portlara bağlama. Portları değiştirip mevcut proxy üzerinden yönlendir veya ayrı sunucu kullan.

## 2. Repo ve yapılandırma

```bash
git clone https://github.com/EmreDemirelsLab/Sigma_Design_Editor_With_Team_-_MCP.git
cd Sigma_Design_Editor_With_Team_-_MCP
python3 scripts/setup.py --domain design.example.com --email admin@example.com
nano .env
```

Gerçek değerleri doldur:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_TLS=true
SMTP_SSL=false
SMTP_DEFAULT_FROM=design@example.com
SMTP_DEFAULT_REPLY_TO=design@example.com
```

SMTP sağlayıcısı 465 ve SSL istiyorsa `SMTP_PORT=465`, `SMTP_SSL=true`, `SMTP_TLS=false` kullan. Gönderen adresi ve SPF/DKIM sağlayıcıda doğrulanmış olmalı. Parolalarda `$` karakteri varsa Compose enterpolasyonundan korunmak için `.env` değerini tek tırnakla yaz. `.env` paylaşma/commit etme.

## 3. Başlat ve ilk ekip

```bash
bash scripts/up.sh
docker compose ps
```

`https://design.example.com` adresinde ilk kullanıcıyı oluştur ve doğrulama e-postasını aç. Ekip oluştur → proje oluştur → dosya oluştur. Ekibi Penpot arayüzünden davet et; üyelerin düzenleme/izleme rollerini oradan ayarla.

Üyeler oluşturulduktan sonra açık kayıt istemiyorsan `.env` içindeki `enable-registration` yerine `disable-registration` yaz; ardından:

```bash
docker compose up -d --force-recreate penpot-backend penpot-frontend penpot-exporter
```

Bu ayarı değiştirdikten sonra davetli yeni kullanıcının kayıt akışını kabul kontrolünde doğrula. Açık kayıt tercihi ekibin kullanıcı katılım modeline bağlıdır.

## 4. Sigma ve MCP

AI paneli: README ve `AI_TR.md`. Claude Code/Codex: `MCP_TR.md`. AI paneli anahtarı ve MCP anahtarı farklıdır. Sağlayıcı API anahtarı yalnızca sunucudadır.

## 5. Bakım

```bash
docker compose logs --tail=100 penpot-backend
bash scripts/backup.sh
```

Logları paylaşmadan önce token/parola/veri kontrolü yap. Uygulama erişim logları Caddy'de kapalıdır; diğer altyapı proxy’lerinde de MCP query token’larını maskele.

`docker compose down` volume'ları korur. **`down -v` tasarımları ve veritabanını siler.** Güncellemeden önce yedek al. `.env` içinde bütün Penpot servisleri için aynı `PENPOT_VERSION` kullanılmalı. Bir sürümün DB migration’ı eski sürüme dönüşü engelleyebilir; rollback için birlikte alınmış DB+asset yedeğini ayrı ortamda test et.

`backups/` hassas DB, tasarım ve `.env` içerir. Şifreli, sunucu dışındaki bir konuma kopyala. Yerel yedek aynı diskin kaybına karşı yeterli değildir. Yedek sırasında yazan servisler geçici durur.

Restore yalnızca bilinçli seçilen ortamda:

```bash
bash scripts/restore.sh backups/20261008T180000Z --confirm-replace-data
```

Mevcut veriler değiştirilir. Önce mevcut veriyi yedekle. Volume ve veritabanı boşaltılıp seçilen yedek yüklenir. Backup’ın Penpot sürümüyle çalıştır. Ayrıntılı test `ACCEPTANCE_TR.md`.

Kaynak: repo uygulaması ve README'deki resmi Penpot kaynakları; kontrol 8 Ekim 2026.
