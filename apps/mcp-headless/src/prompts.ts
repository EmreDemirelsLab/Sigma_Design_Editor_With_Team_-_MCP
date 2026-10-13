// MCP istemleri: uzman tasarım süreçleri. Hem Claude Code hem Codex'te /prompt olarak çağrılabilir.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const LOOP = `
## Kalite döngüsü (her turda zorunlu)
1. Üret → 2. penpot_get_screenshot ile bak → 3. penpot_lint_design çalıştır → 4. tüm error/warning'leri düzelt → 5. tekrar bak.
Skor 90'ın altındaysa ya da ekran görüntüsünde bir şey "neredeyse" doğruysa sunma; düzelt. Sunarken skoru ve kalan bilinçli tercihleri söyle.
Asla tahminle konumlandırma: flex yerleşim kullan (penpot_batch_create + layout, sonra sunucu otomatik hizalar), metinler gerçek fontla ölçülür.`;

const FOUNDATION = `
## Temel kurallar
- Izgara: 8px tabanlı boşluk ölçeği (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). Rastgele değer yok.
- Tipografi: en fazla 2 aile (başlık + gövde), 4-6 boyut. Başlıklar sıkı (line-height 1.05-1.2, hafif negatif harf aralığı), gövde ferah (1.5-1.6). Gövde metni 16px (mobilde 15-17).
- Renk: 1 ana renk + nötr rampa + en fazla 1 vurgu. Ana rengi yüzeylerin %10'undan azında kullan (60-30-10). Önce penpot_create_brand_kit ile rampaları üret, sonra yalnız o değerleri kullan.
- Kontrast: metin WCAG AA (4.5:1, büyük metin 3:1). Gri metni beyaz zeminde #6b7280'den açık yapma.
- Hiyerarşi: her ekranda tek bir odak (tek birincil buton). Boyut, ağırlık ve renk farkı birlikte çalışsın.
- Boşluk cömert olsun: profesyonel his çoğunlukla fazladan beyaz alandan gelir. Grupların içi sıkı, grupların arası geniş (yakınlık ilkesi).
- Hizalama: her öğe bir hizaya otursun; 1-2px "neredeyse" hizalar hata gibi görünür.
- Köşe yarıçapı tutarlı (tek değer ve iki katı), gölgeler yumuşak ve az (y 8-24, blur 24-48, opaklık %8-15).
- İkonlar tek setten (Lucide), tek kontur kalınlığında, 20/24px.`;

export function registerPrompts(server: McpServer) {
  server.registerPrompt("sigma_design_logo", { title: "Logo tasarla (uzman süreci)", description: "Marka için profesyonel logo: brief → 3 farklı yön → seçim → rafine → boyut testleri.",
    argsSchema: { brand: z.string().describe("Marka adı"), brief: z.string().optional().describe("Sektör, değerler, hedef kitle, renk tercihleri"), fileId: z.string().optional(), pageId: z.string().optional() } },
    ({ brand, brief, fileId, pageId }) => ({ messages: [{ role: "user", content: { type: "text", text: `"${brand}" için logo tasarla. ${brief ?? ""}
Dosya: ${fileId ?? "(penpot_list_projects ile bul)"} sayfa: ${pageId ?? "?"}

## Süreç
1. Brief'i 3 kelimelik kişiliğe indir (örn. sakin · kesin · ileri). Rakip/sektör klişelerini listele ve bilerek kaçın (yapay zekâ için: beyin, devre, parıltı, degrade küre).
2. 3 BİRBİRİNDEN GERÇEKTEN FARKLI konsept üret, her biri 1600×1000 board'da yan yana: (a) sembol + kelime markası, (b) monogram / harf tabanlı, (c) yalnız kelime markası (özelleştirilmiş tipografi).
3. Yapım: geometri için penpot_create_primitive (daire, halka dilimi, squircle, yıldız) + penpot_boolean (negatif alan, kesişim). Kelime markası için penpot_text_to_path ile harfleri vektöre çevir, sonra harf aralığını (genelde -%2 ile -%4) ve tek tük harf detayını ayarla. Rastgele süs ekleme: her detayın bir anlamı olsun.
4. Kurgu: optik denge (daireler kareden ~%3 büyük görünmeli), tutarlı kontur kalınlığı, sembol ile kelime markası yüksekliği arasında net oran (örn. sembol = büyük harf yüksekliğinin 1.4 katı), aralarında boşluk = sembol genişliğinin ~%35'i.
5. Varyantlar: yatay, dikey, yalnız sembol, tek renk (siyah ve beyaz), koyu zemin.
6. penpot_export_logo_pack ile 16/32/48/180/512px'te test et: 16px'te sembol hâlâ okunmalı; okunmuyorsa sadeleştirilmiş favicon varyantı yap.
7. penpot_lint_design platform=logo ile denetle; 1-2 renk ile sınırlı kal.
${FOUNDATION}
${LOOP}` } }] }));

  server.registerPrompt("sigma_design_web_page", { title: "Web sayfası tasarla (uzman süreci)", description: "Açılış/ürün sayfası: brand kit → bölümler → masaüstü + mobil → denetim.",
    argsSchema: { product: z.string().describe("Ürün/şirket ve sayfanın amacı"), audience: z.string().optional(), brandColor: z.string().optional().describe("#RRGGBB"), fileId: z.string().optional(), pageId: z.string().optional() } },
    ({ product, audience, brandColor, fileId, pageId }) => ({ messages: [{ role: "user", content: { type: "text", text: `Web sayfası tasarla: ${product}. Hedef kitle: ${audience ?? "belirt"}. Marka rengi: ${brandColor ?? "öner"}.
Dosya: ${fileId ?? "(bul)"} sayfa: ${pageId ?? "?"}

## Süreç
1. Mesaj hiyerarşisi: tek cümlelik değer önerisi (başlık ≤ 8 kelime), destekleyici alt başlık, tek birincil eylem. Gerçekçi Türkçe metin yaz, lorem ipsum yok.
2. penpot_create_brand_kit (primary, heading/body font, radius) → stil sayfası.
3. Masaüstü (1440) sayfayı bölümlerle kur: penpot_insert_web_section ile navbar → hero → logo-cloud → features → (pricing | testimonial) → cta → footer. Her bölümü bir öncekinin nextY değerine yerleştir. Metinleri texts ile ürüne göre değiştir.
4. Şablonu başlangıç say, kopyala-yapıştır sayfası gibi bırakma: hero görselini ürüne özgü bir kompozisyonla değiştir (penpot_insert_image ya da batch_create ile kurulmuş bir arayüz önizlemesi), bölüm ritmini (zemin renkleri: beyaz / surface / koyu) değiştirerek görsel tempo kur.
5. Mobil (390) sürüm: aynı bölümleri width=390 ile üret; dokunma alanları ≥ 44px.
6. Her bölümden sonra ekran görüntüsü; sonunda tüm sayfa için penpot_lint_design.
${FOUNDATION}
${LOOP}` } }] }));

  server.registerPrompt("sigma_design_app_screen", { title: "Uygulama ekranı tasarla (uzman süreci)", description: "Mobil uygulama akışı: cihaz çerçevesi → bileşenler → ekranlar → prototip bağlantıları.",
    argsSchema: { app: z.string().describe("Uygulama ve ekran(lar)ın amacı"), platform: z.enum(["ios", "android"]).optional(), brandColor: z.string().optional(), fileId: z.string().optional(), pageId: z.string().optional() } },
    ({ app, platform, brandColor, fileId, pageId }) => ({ messages: [{ role: "user", content: { type: "text", text: `Mobil uygulama ekranları tasarla: ${app}. Platform: ${platform ?? "ios"}. Marka rengi: ${brandColor ?? "öner"}.
Dosya: ${fileId ?? "(bul)"} sayfa: ${pageId ?? "?"}

## Süreç
1. Akışı yaz: kullanıcının 3-5 adımlık ana görevi (örn. onboarding → giriş → ana sayfa → detay). Her ekranın tek amacı olsun.
2. penpot_create_brand_kit, sonra her ekran için penpot_create_device_frame (${platform === "android" ? "android" : "iphone-16"}); ekranları 80px arayla yan yana diz.
3. İçerik alanını flex column board olarak kur (güvenli alanlar: üst 54px durum çubuğu iOS, alt 34px ev çubuğu). penpot_insert_app_component ile app-bar, search-bar, list-item, card, text-field, button, tab-bar ekle; width = ekran genişliği - 2×16.
4. Platform kuralları: iOS — başlıklar SF/Inter benzeri 17/34pt, 44pt dokunma; Android — Material 3, 48dp dokunma, 16dp kenar.
5. Gerçekçi veri (isimler, tarihler, tutarlar) kullan; boş durumları ve hata durumlarını düşün.
6. penpot_link_screens ile akışı bağla (buton → sonraki ekran, slide-left).
7. Her ekranda penpot_lint_design platform=mobile; dokunma alanı ve kontrast hatası kalmasın.
${FOUNDATION}
${LOOP}` } }] }));

  server.registerPrompt("sigma_design_review", { title: "Tasarımı uzman gözüyle incele ve düzelt", description: "Var olan bir board'u denetle, önceliklendir ve düzelt.",
    argsSchema: { fileId: z.string(), pageId: z.string(), nodeId: z.string() } },
    ({ fileId, pageId, nodeId }) => ({ messages: [{ role: "user", content: { type: "text", text: `Bu tasarımı kıdemli bir tasarımcı gibi incele ve düzelt: file ${fileId}, page ${pageId}, node ${nodeId}.
1. penpot_get_design_context + penpot_lint_design.
2. Bulguları üç gruba ayır: (a) hata (kontrast, taşma, çakışma), (b) sistem (ızgara, boşluk ölçeği, tipografi ölçeği, palet), (c) estetik (hiyerarşi, ritim, denge, beyaz alan).
3. Önce snapshot al (penpot_snapshot), sonra a → b → c sırasıyla düzelt; flex yerleşime çevirmek çoğu hizalama sorununu tek seferde çözer.
4. Önce/sonra ekran görüntüsü ve skor farkını raporla.
${FOUNDATION}` } }] }));
}
