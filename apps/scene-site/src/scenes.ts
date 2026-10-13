// Site içeriği: yeni bir site için yalnız bu dosyayı düzenleyin.
// shape: { icon: "<lucide adı>" } | { text: "..." } | { preset: "globe" | "enso" | "galaxy" | "helix" | "wave" | "cube" | "torus" | "sphere" | "constellation" }
import type { ShapeSpec } from "./particles/shapes";

export interface Scene {
  id: string; label: string; eyebrow: string; title: string; body: string;
  cta?: { label: string; href?: string; primary?: boolean };
  shape: ShapeSpec; particle: [number, number, number]; glowA: string; glowB: string;
  rotation?: [number, number, number]; scale?: number;
}

export const SITE = {
  brand: "ZenGoAi",
  tagline: "Ekibinizin tekrar eden işlerini güvenilir yapay zekâ ajanlarına devreden platform — destek, finans, satış ve operasyon için.",
  chat: { label: "Ajanımızla konuşun", href: "mailto:hello@zengoai.com" },
  links: [{ label: "Hakkımızda", href: "#" }, { label: "Gizlilik", href: "#" }, { label: "KVKK", href: "#" }],
};

// Renkler: lacivert / mavi / turuncu marka paleti. particle 0-1 RGB, glow CSS rengi.
const NAVY = "rgba(27,45,110,0.55)", BLUE = "rgba(47,91,234,0.42)", ORANGE = "rgba(255,106,0,0.34)", TEAL = "rgba(20,150,170,0.36)";

export const SCENES: Scene[] = [
  { id: "intro", label: "Giriş", eyebrow: "Ajan tabanlı yapay zekâ", title: "Sakin, hızlı ve güvenilir işler — yapay zekâ ile.", body: "", cta: { label: "Başlamak için basın" },
    shape: { preset: "enso" }, particle: [1, 0.62, 0.36], glowA: ORANGE, glowB: NAVY, rotation: [0.1, 0, 0], scale: 1.15 },
  { id: "support", label: "Destek Ajanı", eyebrow: "Müşteri deneyimi", title: "Destek Ajanı", body: "Taleplerin %60'ını insan dokunmadan, tutarlı bir tonda ve saniyeler içinde çözer.",
    cta: { label: "Demo izleyin", primary: true }, shape: { icon: "headphones" }, particle: [0.62, 0.74, 1], glowA: BLUE, glowB: NAVY },
  { id: "finance", label: "Fatura Ajanı", eyebrow: "Finans operasyonları", title: "Fatura Ajanı", body: "Faturaları okur, eşleştirir, onaya sunar. Ay sonu kapanışı günler değil saatler sürer.",
    cta: { label: "Yakında" }, shape: { icon: "receipt-text" }, particle: [1, 0.7, 0.45], glowA: ORANGE, glowB: BLUE },
  { id: "analytics", label: "Analitik", eyebrow: "Karar zekâsı", title: "Canlı analitik", body: "Tüm ajanların ne yaptığını, ne kazandırdığını tek panelde, gerçek zamanlı görün.",
    cta: { label: "Panele göz atın" }, shape: { icon: "chart-pie" }, particle: [0.55, 0.82, 1], glowA: TEAL, glowB: NAVY },
  { id: "security", label: "Güvenlik", eyebrow: "Kurumsal güven", title: "Güvenlik ve KVKK", body: "Rol bazlı erişim, tam denetim kaydı ve Türkiye'de barındırma seçeneği.",
    cta: { label: "Güvenlik raporu" }, shape: { icon: "shield-check" }, particle: [0.6, 0.9, 0.78], glowA: TEAL, glowB: BLUE },
  { id: "integrations", label: "Entegrasyonlar", eyebrow: "Bağlantılar", title: "Her yerde çalışır", body: "Slack, e-posta, WhatsApp, CRM ve ERP'nizle birlikte; ekibiniz yeni bir araç öğrenmez.",
    cta: { label: "Entegrasyonlar" }, shape: { preset: "globe" }, particle: [0.65, 0.78, 1], glowA: BLUE, glowB: TEAL, rotation: [0.35, 0, 0.1] },
  { id: "workflows", label: "İş Akışları", eyebrow: "Otomasyon", title: "Görsel iş akışları", body: "Ajanları birbirine bağlayın; onay, eskalasyon ve raporlama kendiliğinden işlesin.",
    cta: { label: "Yakında" }, shape: { icon: "workflow" }, particle: [1, 0.66, 0.42], glowA: ORANGE, glowB: NAVY },
  { id: "code", label: "Kod Ajanı", eyebrow: "Geliştirici", title: "Kod Ajanı", body: "API'nizi okur, test yazar, küçük hataları kendisi düzeltir ve size yalnız onay bırakır.",
    cta: { label: "Dokümantasyon" }, shape: { icon: "square-terminal" }, particle: [0.58, 0.8, 1], glowA: BLUE, glowB: NAVY },
  { id: "contact", label: "Başlayalım", eyebrow: "14 gün ücretsiz", title: "Ajanlarınız bugün çalışmaya başlasın.", body: "Kurulum 5 dakika. Kredi kartı gerekmez.",
    cta: { label: "Ücretsiz başlayın", primary: true }, shape: { preset: "galaxy" }, particle: [1, 0.72, 0.5], glowA: ORANGE, glowB: BLUE, rotation: [0.9, 0, 0.2], scale: 1.1 },
];
