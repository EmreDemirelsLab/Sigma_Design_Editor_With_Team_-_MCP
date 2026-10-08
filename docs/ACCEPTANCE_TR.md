# Sunucuda canlı kabul kontrolü

Aşağıdakiler geçmeden tam sistem doğrulanmış sayılmaz. Hazırlama ortamında Docker bulunmadığı için bunlar yapılmamıştır.

- `docker compose ps`: tüm servisler çalışıyor; postgres/valkey/assistant sağlıklı.
- HTTPS sertifikası geçerli; `https://DOMAIN/sigma/health` ok=true.
- İlk hesap doğrulama e-postası ulaşır; giriş ve çıkış çalışır.
- İkinci hesap davet edilir. İki tarayıcı aynı dosyayı açar; birinin eklediği şekil diğerinde görünür.
- İzleyici rolü yazamaz. Ekipten çıkarılan kullanıcı dosyaya erişemez.
- Sigma eklentisi manifest URL'den yüklenir. Boş seçim bağlamı yüklenir.
- AI provider yapılandırılır; kişisel token ile prompt gerçek sağlayıcıdan plan alır.
- Önizlemeden tuvale eklenen metinler/şekiller elle düzenlenebilir; geri al hepsini kaldırır.
- Sayfa değiştiğinde eski AI planı uygulanmaz. Hatalı plan/yanlış token değişiklik yapmaz.
- Claude Code veya Codex MCP araçlarını görür; katman okuyup yeni şekil ekler.
- Tarayıcı sekmesi uykuya alındıktan sonra yeniden bağlanma denenir.
- Yedek alınır; ayrı, geçici kurulumda DB+asset geri yüklenir. Dosyalar, ekipler ve tasarımlar korunur.
- Üretimde mailcatch profili kapalı; DB/Valkey/MCP portları internete açık değil.

Kaynak: proje kabul senaryoları, 8 Ekim 2026. Bu dosya tamamlanmış test raporu değildir.
