// Şablonlar: cihaz çerçeveleri, web bölümleri ve uygulama bileşenleri. Hepsi düzenlenebilir katmanlar, flex yerleşim ve marka değişkenleriyle üretilir.
import { themeColors, typeScale, type Brand } from "./brand.js";
import type { Json } from "./penpot.js";

export type Op = Json; // penpot_batch_create op biçimi (+ hSizing/vSizing, icon, shadow, attrs)

export const DEVICES: Record<string, { w: number; h: number; kind: "ios" | "android" | "tablet" | "desktop" | "web-mobile"; grid: { count: number; margin: number; gutter: number } }> = {
  "iphone-16": { w: 393, h: 852, kind: "ios", grid: { count: 4, margin: 16, gutter: 16 } },
  "iphone-16-pro-max": { w: 440, h: 956, kind: "ios", grid: { count: 4, margin: 20, gutter: 16 } },
  "iphone-se": { w: 375, h: 667, kind: "ios", grid: { count: 4, margin: 16, gutter: 16 } },
  "android": { w: 412, h: 915, kind: "android", grid: { count: 4, margin: 16, gutter: 16 } },
  "ipad-11": { w: 834, h: 1194, kind: "tablet", grid: { count: 8, margin: 32, gutter: 24 } },
  "tablet": { w: 768, h: 1024, kind: "tablet", grid: { count: 8, margin: 32, gutter: 24 } },
  "laptop": { w: 1280, h: 800, kind: "desktop", grid: { count: 12, margin: 64, gutter: 24 } },
  "desktop": { w: 1440, h: 1024, kind: "desktop", grid: { count: 12, margin: 80, gutter: 24 } },
  "mobile-web": { w: 390, h: 844, kind: "web-mobile", grid: { count: 4, margin: 20, gutter: 16 } },
};

const columnGrid = (g: { count: number; margin: number; gutter: number }, color: string) =>
  [{ type: "column", display: true, params: { color: { color, opacity: 0.08 }, type: "stretch", size: g.count, margin: g.margin, gutter: g.gutter, itemLength: null } }];

export interface TplOpts { x: number; y: number; width?: number; parent?: string; texts?: Record<string, string>; variant?: string; items?: number }

/** Tipografi basamağından metin op'u. */
function T(brand: Brand, step: string, color: string, extra: Json = {}): Json {
  const s = typeScale(16, 1.25, brand.headingFont, brand.bodyFont).find(x => x.name === step)!;
  return { op: "text", fontFamily: s.family, fontSize: s.size, fontWeight: s.weight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color, ...extra };
}
const shadowSoft = (color: string) => ({ x: 0, y: 8, blur: 24, spread: -6, color, opacity: 0.12 });

export function deviceFrame(brand: Brand, device: string, o: TplOpts): Op[] {
  const d = DEVICES[device]; if (!d) throw new Error(`Bilinmeyen cihaz: ${device}. Seçenekler: ${Object.keys(DEVICES).join(", ")}`);
  const c = themeColors(brand); const ops: Op[] = [{ op: "board", ref: "root", name: o.texts?.name ?? `${device} · ${d.w}×${d.h}`, x: o.x, y: o.y, width: d.w, height: d.h, fill: c.bg, parent: o.parent, attrs: { grids: columnGrid(d.grid, c.primary) } }];
  if (d.kind === "ios" || d.kind === "android") {
    const sbH = d.kind === "ios" ? 54 : 32;
    ops.push({ op: "board", ref: "status", parent: "root", name: "Status Bar", x: o.x, y: o.y, width: d.w, height: sbH, fill: null, layout: { direction: "row", justify: "space-between", align: "center", padding: [d.kind === "ios" ? 18 : 6, 24, 0, d.kind === "ios" ? 36 : 20] } },
      T(brand, "H4", c.text, { parent: "status", name: "Time", text: "9:41", fontSize: d.kind === "ios" ? 17 : 14, fontWeight: "600", letterSpacing: 0, fontFamily: d.kind === "ios" ? "Inter" : "Roboto" }),
      { op: "board", ref: "sbIcons", parent: "status", name: "Indicators", x: o.x, y: o.y, width: 80, height: 16, fill: null, layout: { direction: "row", gap: 6, align: "center", justify: "end" }, hSizing: "auto", vSizing: "auto" },
      { op: "icon", parent: "sbIcons", name: "signal", icon: "signal", size: 16, color: c.text, strokeWidth: 2.5 },
      { op: "icon", parent: "sbIcons", name: "wifi", icon: "wifi", size: 16, color: c.text, strokeWidth: 2.5 },
      { op: "icon", parent: "sbIcons", name: "battery", icon: "battery-full", size: 20, color: c.text, strokeWidth: 2 });
    if (d.kind === "ios") ops.push({ op: "rect", parent: "root", name: "Home Indicator", x: o.x + (d.w - 134) / 2, y: o.y + d.h - 8 - 5, width: 134, height: 5, radius: 3, fill: c.text });
    else ops.push({ op: "rect", parent: "root", name: "Gesture Bar", x: o.x + (d.w - 108) / 2, y: o.y + d.h - 6 - 4, width: 108, height: 4, radius: 2, fill: c.textSubtle });
  }
  return ops;
}


/** Hero için gerçekçi ürün arayüzü önizlemesi: pencere çubuğu, kenar menü, KPI kartları ve grafik. Tamamen düzenlenebilir katmanlar. */
function productPreview(brand: Brand, parent: string, w: number, mobile: boolean): Op[] {
  const c = themeColors(brand); const h = mobile ? 260 : Math.round(w * 0.56); const R = brand.radius;
  const ops: Op[] = [{ op: "board", ref: "pv", parent, name: "Product Preview", x: 0, y: 0, width: w, height: h, fill: c.bg, radius: R * 1.5, stroke: c.border, strokeWidth: 1, clip: true, margin: [40, 0, 0, 0], shadow: [{ x: 0, y: 24, blur: 64, spread: -12, color: c.text, opacity: 0.18 }], layout: { direction: "column" } },
    { op: "board", ref: "pvBar", parent: "pv", name: "Window Bar", x: 0, y: 0, width: w, height: 40, fill: c.surface, layout: { direction: "row", align: "center", gap: 8, padding: [0, 16, 0, 16] }, hSizing: "fill" },
    ...["#ff5f57", "#febc2e", "#28c840"].map(col => ({ op: "ellipse", parent: "pvBar", name: "Dot", x: 0, y: 0, width: 10, height: 10, fill: col })),
    { op: "board", ref: "pvBody", parent: "pv", name: "Body", x: 0, y: 0, width: w, height: h - 40, fill: null, layout: { direction: "row" }, hSizing: "fill", vSizing: "fill" }];
  if (!mobile) { ops.push({ op: "board", ref: "pvSide", parent: "pvBody", name: "Sidebar", x: 0, y: 0, width: 200, height: h - 40, fill: c.surface, layout: { direction: "column", gap: 10, padding: [20, 16, 20, 16] }, vSizing: "fill" });
    ["layout-dashboard", "bot", "workflow", "chart-line", "settings"].forEach((ic, i) => { ops.push({ op: "board", ref: `nav${i}`, parent: "pvSide", name: "Nav Item", x: 0, y: 0, width: 168, height: 32, fill: i === 0 ? c.primarySoft : null, radius: R * 0.6, layout: { direction: "row", align: "center", gap: 10, padding: [0, 10, 0, 10] }, hSizing: "fill" },
      { op: "icon", parent: `nav${i}`, icon: ic, size: 16, color: i === 0 ? c.primary : c.textSubtle },
      { op: "rect", parent: `nav${i}`, name: "Label", x: 0, y: 0, width: [70, 52, 64, 58, 48][i], height: 8, radius: 4, fill: i === 0 ? c.primaryTint : c.border }); }); }
  ops.push({ op: "board", ref: "pvMain", parent: "pvBody", name: "Main", x: 0, y: 0, width: 600, height: h - 40, fill: null, layout: { direction: "column", gap: 16, padding: 24 }, hSizing: "fill", vSizing: "fill" },
    { op: "board", ref: "kpis", parent: "pvMain", name: "KPIs", x: 0, y: 0, width: 600, height: 96, fill: null, layout: { direction: "row", gap: 16 }, hSizing: "fill" });
  [["Çözülen talepler", "12.480", "+18%"], ["Ort. yanıt", "1,2 sn", "−42%"], ["Tasarruf", "₺184K", "+27%"]].slice(0, mobile ? 2 : 3).forEach(([l, v, d], i) => ops.push(
    { op: "board", ref: `k${i}`, parent: "kpis", name: "KPI", x: 0, y: 0, width: 180, height: 96, fill: c.bg, radius: R, stroke: c.border, strokeWidth: 1, layout: { direction: "column", gap: 6, padding: 16 }, hSizing: "fill" },
    T(brand, "Caption", c.textMuted, { parent: `k${i}`, text: l, letterSpacing: 0, fontWeight: "500" }),
    { op: "text", parent: `k${i}`, runs: [{ text: v, fontSize: 22, fontWeight: "700", color: c.text }, { text: `  ${d}`, fontSize: 12, fontWeight: "600", color: d.startsWith("−") || d.startsWith("+") ? "#16a34a" : c.textMuted }], fontFamily: brand.headingFont, lineHeight: 1.2 }));
  ops.push({ op: "board", ref: "chart", parent: "pvMain", name: "Chart", x: 0, y: 0, width: 600, height: 200, fill: c.bg, radius: R, stroke: c.border, strokeWidth: 1, layout: { direction: "row", align: "end", justify: "space-between", gap: 10, padding: [24, 20, 20, 20] }, hSizing: "fill", vSizing: "fill" });
  [38, 52, 44, 63, 58, 72, 66, 81, 77, 90, 86, 97].slice(0, mobile ? 7 : 12).forEach((v, i, a) => ops.push({ op: "rect", parent: "chart", name: "Bar", x: 0, y: 0, width: 24, height: Math.max(12, Math.round((h - 40 - 96 - 48 - 60) * v / 100)), radius: 6, fill: i === a.length - 1 ? c.accent : i >= a.length - 4 ? c.primary : c.primaryTint, hSizing: "fill" }));
  return ops;
}

// ---------- web bölümleri ----------
const btn = (brand: Brand, parent: string, ref: string, label: string, kind: "primary" | "secondary" | "ghost", size: "md" | "lg" = "md"): Op[] => {
  const c = themeColors(brand); const h = size === "lg" ? 52 : 44, padX = size === "lg" ? 28 : 20;
  const fill = kind === "primary" ? c.primary : kind === "secondary" ? c.bg : null, color = kind === "primary" ? c.onPrimary : c.text;
  return [{ op: "board", ref, parent, name: `Button / ${kind}`, x: 0, y: 0, width: 120, height: h, fill, radius: brand.radius, stroke: kind === "secondary" ? c.border : null, strokeWidth: 1,
      layout: { direction: "row", align: "center", justify: "center", gap: 8, padding: [0, padX, 0, padX] }, hSizing: "auto", vSizing: "fix" },
    T(brand, "Body", color, { parent: ref, name: "Label", text: label, fontWeight: "600", fontSize: size === "lg" ? 17 : 15, lineHeight: 1.2 })];
};

export function webSection(brand: Brand, kind: string, o: TplOpts): Op[] {
  const c = themeColors(brand); const W = o.width ?? 1440; const padX = W >= 1200 ? 80 : W >= 768 ? 48 : 20; const t = o.texts ?? {};
  const root = (name: string, fill: string | null, layout: Json, extra: Json = {}): Op => ({ op: "board", ref: "root", parent: o.parent, name, x: o.x, y: o.y, width: W, height: 200, fill, layout, hSizing: "fix", vSizing: "auto", ...extra });
  const mobile = W < 768;
  switch (kind) {
    case "navbar": return [root("Navbar", c.bg, { direction: "row", justify: "space-between", align: "center", padding: [20, padX, 20, padX] }, { stroke: c.border, strokeWidth: 1 }),
      T(brand, "H4", c.text, { parent: "root", name: "Logo", text: t.logo ?? "Brand", fontWeight: "700" }),
      ...(mobile ? [{ op: "icon", parent: "root", name: "Menu", icon: "menu", size: 24, color: c.text }] : [
        { op: "board", ref: "links", parent: "root", name: "Links", x: 0, y: 0, width: 400, height: 24, fill: null, layout: { direction: "row", gap: 32, align: "center" }, hSizing: "auto", vSizing: "auto" },
        ...(t.links ?? "Ürün,Çözümler,Fiyatlar,Kaynaklar").split(",").map((l: string) => T(brand, "Small", c.textMuted, { parent: "links", name: l.trim(), text: l.trim(), fontWeight: "500", fontSize: 15 })),
        ...btn(brand, "root", "cta", t.cta ?? "Başlayın", "primary")])];
    case "hero": return [root("Hero", c.bg, { direction: "column", align: "center", gap: 24, padding: [mobile ? 64 : 128, padX, mobile ? 64 : 128, padX] }),
      { op: "board", ref: "pill", parent: "root", name: "Eyebrow", x: 0, y: 0, width: 100, height: 32, fill: c.primarySoft, radius: 999, layout: { direction: "row", align: "center", gap: 8, padding: [6, 14, 6, 14] }, hSizing: "auto", vSizing: "auto" },
      T(brand, "Overline", c.primary, { parent: "pill", name: "Eyebrow Text", text: (t.eyebrow ?? "Yeni · Yapay zekâ destekli").toLocaleUpperCase("tr"), letterSpacing: 1.2 }),
      T(brand, mobile ? "H1" : "Display", c.text, { parent: "root", name: "Headline", text: t.title ?? "Fikirden ürüne, aynı gün.", align: "center", width: Math.min(W - padX * 2, 960), hSizing: "fix",
        fontSize: W >= 1200 ? 64 : W >= 768 ? 48 : 36, lineHeight: 1.05, letterSpacing: W >= 1200 ? -2 : -1 }),
      T(brand, "Body L", c.textMuted, { parent: "root", name: "Subtitle", text: t.subtitle ?? "Ekibiniz için tasarım, kod ve otomasyonu tek bir sakin akışta birleştiriyoruz.", align: "center", width: Math.min(W - padX * 2, 640), hSizing: "fix" }),
      { op: "board", ref: "actions", parent: "root", name: "Actions", x: 0, y: 0, width: 300, height: 52, fill: null, layout: { direction: mobile ? "column" : "row", gap: 12, align: "center" }, hSizing: "auto", vSizing: "auto", margin: [16, 0, 0, 0] },
      ...btn(brand, "actions", "b1", t.cta ?? "Ücretsiz deneyin", "primary", "lg"), ...btn(brand, "actions", "b2", t.cta2 ?? "Demo izleyin", "secondary", "lg"),
      ...(t.noImage ? [] : productPreview(brand, "root", Math.min(W - padX * 2, 1120), mobile))];
    case "features": { const n = o.items ?? 3; const titles = (t.items ?? "Hızlı başlangıç,Ekip uyumu,Güvenli altyapı,Ölçeklenebilir,Akıllı otomasyon,Destek").split(",");
      const icons = (t.icons ?? "zap,users,shield-check,trending-up,sparkles,life-buoy").split(",").map((x: string) => x.trim());
      const ops: Op[] = [root("Features", c.surface, { direction: "column", align: "center", gap: 56, padding: [96, padX, 96, padX] }),
        { op: "board", ref: "head", parent: "root", name: "Heading", x: 0, y: 0, width: 720, height: 100, fill: null, layout: { direction: "column", align: "center", gap: 16 }, hSizing: "fix", vSizing: "auto" },
        T(brand, "H2", c.text, { parent: "head", name: "Title", text: t.title ?? "Ekibinizin ihtiyaç duyduğu her şey", align: "center", width: 720, hSizing: "fill" }),
        T(brand, "Body L", c.textMuted, { parent: "head", name: "Subtitle", text: t.subtitle ?? "Karmaşık araç yığınları yerine tek, sade ve güçlü bir platform.", align: "center", width: 720, hSizing: "fill" }),
        { op: "board", ref: "grid", parent: "root", name: "Cards", x: 0, y: 0, width: W - padX * 2, height: 200, fill: null, layout: { direction: mobile ? "column" : "row", gap: 24, align: "stretch" }, hSizing: "fill", vSizing: "auto" }];
      for (let i = 0; i < n; i++) ops.push(
        { op: "board", ref: `c${i}`, parent: "grid", name: `Feature ${i + 1}`, x: 0, y: 0, width: 300, height: 200, fill: c.bg, radius: brand.radius * 1.5, stroke: c.border, strokeWidth: 1, layout: { direction: "column", gap: 16, padding: 32 }, hSizing: "fill", vSizing: "auto" },
        { op: "board", ref: `i${i}`, parent: `c${i}`, name: "Icon Tile", x: 0, y: 0, width: 48, height: 48, fill: c.primarySoft, radius: brand.radius, layout: { direction: "row", align: "center", justify: "center" } },
        { op: "icon", parent: `i${i}`, name: icons[i % icons.length], icon: icons[i % icons.length], size: 24, color: c.primary },
        T(brand, "H4", c.text, { parent: `c${i}`, name: "Title", text: (titles[i] ?? `Özellik ${i + 1}`).trim(), hSizing: "fill", width: 240 }),
        T(brand, "Body", c.textMuted, { parent: `c${i}`, name: "Text", text: (t.descs ?? "").split("|")[i]?.trim() || "Kısa, net bir açıklama: bu özellik kullanıcının hangi sorununu nasıl çözüyor.", hSizing: "fill", width: 240 }));
      return ops; }
    case "pricing": { const tiers = [["Başlangıç", "₺0", "Bireyler için"], ["Pro", "₺490", "Büyüyen ekipler için"], ["Kurumsal", "Özel", "Ölçek ve güvenlik"]];
      const ops: Op[] = [root("Pricing", c.bg, { direction: "column", align: "center", gap: 56, padding: [96, padX, 96, padX] }),
        T(brand, "H2", c.text, { parent: "root", name: "Title", text: t.title ?? "Sade fiyatlandırma", align: "center" }),
        { op: "board", ref: "row", parent: "root", name: "Tiers", x: 0, y: 0, width: Math.min(W - padX * 2, 1120), height: 400, fill: null, layout: { direction: mobile ? "column" : "row", gap: 24, align: "stretch" }, hSizing: "fix", vSizing: "auto" }];
      tiers.forEach(([name, price, desc], i) => { const hi = i === 1, ref = `t${i}`, fg = hi ? c.inverseText : c.text, mu = hi ? "#c7cbd6" : c.textMuted;
        ops.push({ op: "board", ref, parent: "row", name: `Tier / ${name}`, x: 0, y: 0, width: 340, height: 400, fill: hi ? c.inverseBg : c.bg, radius: brand.radius * 2, stroke: hi ? null : c.border, strokeWidth: 1, layout: { direction: "column", gap: 20, padding: 32 }, hSizing: "fill", vSizing: "auto", ...(hi ? { shadow: shadowSoft(c.text) } : {}) },
          T(brand, "H4", fg, { parent: ref, name: "Name", text: name }), T(brand, "Small", mu, { parent: ref, name: "Desc", text: desc }),
          { op: "text", parent: ref, name: "Price", runs: [{ text: price, fontSize: 44, fontWeight: "700", color: fg }, ...(price.startsWith("₺") ? [{ text: " /ay", fontSize: 16, fontWeight: "400", color: mu }] : [])], fontFamily: brand.headingFont, lineHeight: 1.1, letterSpacing: -1 },
          ...["Sınırsız proje", "Ekip paylaşımı", "Öncelikli destek"].map(f => T(brand, "Small", fg, { parent: ref, name: "Feature", text: `✓  ${f}` })),
          ...btn(brand, ref, `tb${i}`, hi ? "Pro'ya geçin" : "Başlayın", hi ? "primary" : "secondary"));
        ops.push({ op: "patch", ref: `tb${i}`, hSizing: "fill" }); });
      return ops; }
    case "testimonial": return [root("Testimonial", c.surface, { direction: "column", align: "center", gap: 32, padding: [96, padX, 96, padX] }),
      T(brand, "H3", c.text, { parent: "root", name: "Quote", text: t.quote ?? "“Üç haftalık işi iki günde bitirdik. Ekip ilk kez aynı ekrana bakıyor.”", align: "center", width: Math.min(W - padX * 2, 820), hSizing: "fix", lineHeight: 1.35 }),
      { op: "board", ref: "who", parent: "root", name: "Author", x: 0, y: 0, width: 240, height: 48, fill: null, layout: { direction: "row", gap: 14, align: "center" }, hSizing: "auto", vSizing: "auto" },
      { op: "board", ref: "av", parent: "who", name: "Avatar", x: 0, y: 0, width: 48, height: 48, fill: c.primaryTint, radius: 999, layout: { direction: "row", align: "center", justify: "center" } },
      T(brand, "Body", c.primaryStrong, { parent: "av", name: "Initials", text: (t.name ?? "Elif Kaya").split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toLocaleUpperCase("tr"), fontWeight: "700", lineHeight: 1 }),
      { op: "board", ref: "meta", parent: "who", name: "Meta", x: 0, y: 0, width: 160, height: 40, fill: null, layout: { direction: "column", gap: 2 }, hSizing: "auto", vSizing: "auto" },
      T(brand, "Body", c.text, { parent: "meta", name: "Name", text: t.name ?? "Elif Kaya", fontWeight: "600" }), T(brand, "Small", c.textMuted, { parent: "meta", name: "Role", text: t.role ?? "Ürün Direktörü, Atlas" })];
    case "logo-cloud": return [root("Logo Cloud", c.bg, { direction: "column", align: "center", gap: 28, padding: [56, padX, 56, padX] }),
      T(brand, "Overline", c.textMuted, { parent: "root", name: "Label", text: t.label ?? "BİZE GÜVENEN EKİPLER" }),
      { op: "board", ref: "row", parent: "root", name: "Logos", x: 0, y: 0, width: W - padX * 2, height: 32, fill: null, layout: { direction: "row", justify: "space-between", align: "center", wrap: mobile }, hSizing: "fill", vSizing: "auto" },
      ...["Atlas", "Nova", "Vertex", "Orbit", "Lumen"].map(n => T(brand, "H4", c.textSubtle, { parent: "row", name: n, text: n, fontWeight: "700", letterSpacing: -0.5 }))];
    case "cta": return [root("CTA", c.primary, { direction: mobile ? "column" : "row", justify: "space-between", align: mobile ? "start" : "center", gap: 24, padding: [64, padX, 64, padX] }),
      { op: "board", ref: "txt", parent: "root", name: "Copy", x: 0, y: 0, width: 640, height: 100, fill: null, layout: { direction: "column", gap: 10 }, hSizing: "auto", vSizing: "auto" },
      T(brand, "H2", c.onPrimary, { parent: "txt", name: "Title", text: t.title ?? "Bugün başlayın." }), T(brand, "Body L", c.onPrimary, { parent: "txt", name: "Subtitle", text: t.subtitle ?? "Kurulum 5 dakika. Kredi kartı gerekmez.", opacity: 0.85 }),
      { op: "board", ref: "b", parent: "root", name: "Button / inverse", x: 0, y: 0, width: 160, height: 52, fill: c.onPrimary, radius: brand.radius, layout: { direction: "row", align: "center", justify: "center", padding: [0, 28, 0, 28] }, hSizing: "auto", vSizing: "fix" },
      T(brand, "Body", c.primary, { parent: "b", name: "Label", text: t.cta ?? "Ücretsiz başlayın", fontWeight: "600", fontSize: 17, lineHeight: 1.2 })];
    case "scene-hero": case "scene": { // koyu, parçacıklı sahne (premium AI/fintech dili): kuzey ışığı zemin + cam buton + nokta çizimi
      const H = mobile ? 844 : Math.round(W * 0.625), dark = "#05060c", hero = kind === "scene-hero";
      const glowA = t.glowA ?? brand.accent ?? "#ff6a00", glowB = t.glowB ?? brand.primary;
      const ops: Op[] = [{ op: "board", ref: "root", parent: o.parent, name: hero ? "Scene Hero" : `Scene · ${t.title ?? ""}`, x: o.x, y: o.y, width: W, height: H, fill: dark, clip: true },
        { op: "ellipse", parent: "root", name: "Aurora A", x: o.x - W * 0.25, y: o.y - H * 0.45, width: W * 0.9, height: W * 0.9, fill: null, fillGradient: { type: "radial", stops: [{ color: glowA, opacity: 0.38, offset: 0 }, { color: glowA, opacity: 0, offset: 1 }] }, blur: 60 },
        { op: "ellipse", parent: "root", name: "Aurora B", x: o.x + W * 0.45, y: o.y + H * 0.35, width: W * 0.85, height: W * 0.85, fill: null, fillGradient: { type: "radial", stops: [{ color: glowB, opacity: 0.5, offset: 0 }, { color: glowB, opacity: 0, offset: 1 }] }, blur: 60 }];
      const pad = mobile ? 20 : 64, artSize = hero ? Math.min(W, H) * 0.9 : mobile ? W * 0.8 : H * 0.72;
      ops.push({ op: "dots", parent: "root", name: "Particle Illustration", x: hero ? o.x + (W - artSize) / 2 : mobile ? o.x + (W - artSize) / 2 : o.x + W - artSize - pad * 1.2, y: hero ? o.y + (H - artSize) / 2 : mobile ? o.y + 110 : o.y + (H - artSize) / 2,
        size: artSize, icon: t.icon, preset: t.icon ? undefined : (t.preset ?? (hero ? "enso" : "globe")), dots: t.dots ?? (hero ? 2600 : 2200), color: t.particle ?? (hero ? "#ffb27a" : "#9ec5ff") });
      ops.push({ op: "text", parent: "root", name: "Brand", text: t.logo ?? "Brand", x: o.x + pad, y: o.y + 36, fontFamily: brand.headingFont, fontSize: 17, fontWeight: "600", color: "#ffffff" },
        { op: "board", ref: "chat", parent: "root", name: "Glass Pill / small", x: o.x + W - pad - 200, y: o.y + 30, width: 200, height: 34, fill: "#ffffff", fillOpacity: 0.07, stroke: "#ffffff", strokeWidth: 1, radius: 999, layout: { direction: "row", align: "center", gap: 8, padding: [0, 16, 0, 16] }, hSizing: "auto", attrs: { strokes: [{ strokeColor: "#ffffff", strokeOpacity: 0.18, strokeWidth: 1, strokeStyle: "solid", strokeAlignment: "inner" }] } },
        { op: "text", parent: "chat", name: "Label", text: (t.chat ?? "Ajanımızla konuşun").toLocaleUpperCase("tr"), fontFamily: brand.bodyFont, fontSize: 11, letterSpacing: 1.4, color: "#ffffff" });
      const contentW = hero ? Math.min(W - pad * 2, 980) : mobile ? W - pad * 2 : Math.min(560, W * 0.42);
      const cx = hero ? o.x + (W - contentW) / 2 : o.x + pad, cy = hero ? o.y + H * 0.3 : mobile ? o.y + H - 360 : o.y + H * 0.34;
      ops.push({ op: "board", ref: "copy", parent: "root", name: "Copy", x: cx, y: cy, width: contentW, height: 300, fill: null, layout: { direction: "column", gap: hero ? 22 : 18, align: hero ? "center" : "start" }, vSizing: "auto" },
        { op: "text", parent: "copy", name: "Eyebrow", text: (t.eyebrow ?? "Ajan tabanlı yapay zekâ").toLocaleUpperCase("tr"), fontFamily: brand.bodyFont, fontSize: 11, letterSpacing: 3.4, color: "#ffffff", opacity: 0.55 },
        { op: "text", parent: "copy", name: "Headline", text: t.title ?? "Sakin, hızlı ve güvenilir işler.", fontFamily: brand.headingFont, fontSize: hero ? (mobile ? 44 : Math.round(W * 0.066)) : (mobile ? 40 : Math.round(W * 0.05)), fontWeight: hero ? "300" : "700",
          lineHeight: 0.98, letterSpacing: hero ? -3 : -2, color: "#ffffff", width: contentW, hSizing: "fill", align: hero ? "center" : "left" });
      if (t.subtitle) ops.push({ op: "text", parent: "copy", name: "Body", text: t.subtitle, fontFamily: brand.bodyFont, fontSize: 16, lineHeight: 1.6, color: "#ffffff", opacity: 0.74, width: Math.min(contentW, 420), align: hero ? "center" : "left" });
      if (hero) ops.push({ op: "ellipse", parent: "copy", name: "Begin Orb", width: 72, height: 72, fill: null, fillGradient: { type: "radial", stops: [{ color: "#ffffff", opacity: 0.35, offset: 0 }, { color: glowA, opacity: 0.18, offset: 0.5 }, { color: "#ffffff", opacity: 0.04, offset: 1 }] }, stroke: "#ffffff", strokeWidth: 1, margin: [28, 0, 0, 0], shadow: { y: 0, blur: 40, color: glowA, opacity: 0.45 } });
      else ops.push({ op: "board", ref: "cta", parent: "copy", name: "Glass Pill", width: 160, height: 46, fill: t.ctaPrimary ? glowA : "#ffffff", fillOpacity: t.ctaPrimary ? 0.85 : 0.07, radius: 999, layout: { direction: "row", align: "center", gap: 10, padding: [0, 24, 0, 24] }, hSizing: "auto", margin: [12, 0, 0, 0],
          shadow: { y: 10, blur: 28, color: t.ctaPrimary ? glowA : glowB, opacity: 0.4 }, attrs: { strokes: [{ strokeColor: "#ffffff", strokeOpacity: 0.2, strokeWidth: 1, strokeStyle: "solid", strokeAlignment: "inner" }] } },
        { op: "text", parent: "cta", name: "Label", text: t.cta ?? "Demo izleyin", fontFamily: brand.bodyFont, fontSize: 15, color: "#ffffff" });
      if (hero) ops.push({ op: "text", parent: "copy", name: "Begin Label", text: (t.cta ?? "Başlamak için basın").toLocaleUpperCase("tr"), fontFamily: brand.bodyFont, fontSize: 11, letterSpacing: 3.4, color: "#ffffff", opacity: 0.55 });
      ops.push({ op: "text", parent: "root", name: "Footer", runs: [{ text: "● ", color: glowA }, { text: `${t.label ?? (hero ? "Giriş" : t.title ?? "")}   ${t.step ?? "00 / 08"}` }], x: o.x + pad, y: o.y + H - 44, fontFamily: brand.bodyFont, fontSize: 11.5, color: "#ffffff", opacity: 0.7 });
      return ops; }
    case "footer": { const cols = [["Ürün", "Özellikler,Fiyatlar,Güncellemeler"], ["Şirket", "Hakkımızda,Kariyer,İletişim"], ["Kaynaklar", "Blog,Rehberler,Destek"]];
      const ops: Op[] = [root("Footer", c.inverseBg, { direction: "column", gap: 48, padding: [72, padX, 40, padX] }),
        { op: "board", ref: "top", parent: "root", name: "Top", x: 0, y: 0, width: W - padX * 2, height: 160, fill: null, layout: { direction: mobile ? "column" : "row", justify: "space-between", gap: 40 }, hSizing: "fill", vSizing: "auto" },
        { op: "board", ref: "brand", parent: "top", name: "Brand", x: 0, y: 0, width: 280, height: 80, fill: null, layout: { direction: "column", gap: 12 }, hSizing: "fix", vSizing: "auto" },
        T(brand, "H4", c.inverseText, { parent: "brand", name: "Logo", text: t.logo ?? "Brand", fontWeight: "700" }),
        T(brand, "Small", "#9aa3b5", { parent: "brand", name: "Tagline", text: t.tagline ?? "Sakin, hızlı ve güvenilir yazılım.", width: 280, hSizing: "fill" })];
      cols.forEach(([h, ls], i) => { ops.push({ op: "board", ref: `col${i}`, parent: "top", name: h, x: 0, y: 0, width: 160, height: 120, fill: null, layout: { direction: "column", gap: 12 }, hSizing: "auto", vSizing: "auto" },
        T(brand, "Small", c.inverseText, { parent: `col${i}`, name: "Heading", text: h, fontWeight: "600" }), ...ls.split(",").map(l => T(brand, "Small", "#9aa3b5", { parent: `col${i}`, name: l, text: l }))); });
      ops.push({ op: "rect", parent: "root", name: "Divider", x: 0, y: 0, width: W - padX * 2, height: 1, fill: "#2a3142", hSizing: "fill" },
        T(brand, "Caption", "#7d869a", { parent: "root", name: "Legal", text: `© ${new Date().getFullYear()} ${t.logo ?? "Brand"}. Tüm hakları saklıdır.`, letterSpacing: 0 }));
      return ops; }
  }
  throw new Error(`Bilinmeyen web bölümü: ${kind}. Seçenekler: navbar, hero, logo-cloud, features, pricing, testimonial, cta, footer, scene-hero, scene`);
}

// ---------- uygulama bileşenleri ----------
export function appComponent(brand: Brand, kind: string, o: TplOpts): Op[] {
  const c = themeColors(brand); const W = o.width ?? 393; const t = o.texts ?? {};
  const root = (name: string, h: number, fill: string | null, layout: Json, extra: Json = {}): Op => ({ op: "board", ref: "root", parent: o.parent, name, x: o.x, y: o.y, width: W, height: h, fill, layout, ...extra });
  switch (kind) {
    case "app-bar": return [root("App Bar", 56, c.bg, { direction: "row", align: "center", justify: "space-between", padding: [0, 8, 0, 8] }, { vSizing: "fix" }),
      { op: "board", ref: "l", parent: "root", name: "Leading", x: 0, y: 0, width: 44, height: 44, fill: null, layout: { direction: "row", align: "center", justify: "center" } },
      { op: "icon", parent: "l", name: "back", icon: "chevron-left", size: 24, color: c.text },
      T(brand, "H4", c.text, { parent: "root", name: "Title", text: t.title ?? "Başlık", fontSize: 17, fontWeight: "600" }),
      { op: "board", ref: "r", parent: "root", name: "Trailing", x: 0, y: 0, width: 44, height: 44, fill: null, layout: { direction: "row", align: "center", justify: "center" } },
      { op: "icon", parent: "r", name: "more", icon: "ellipsis", size: 24, color: c.text }];
    case "tab-bar": { const tabs = (t.tabs ?? "Ana sayfa:house,Keşfet:compass,Kaydet:bookmark,Profil:user").split(",").map((x: string) => x.split(":"));
      const ops: Op[] = [root("Tab Bar", 83, c.bg, { direction: "row", justify: "space-around", align: "start", padding: [8, 8, 0, 8] }, { stroke: c.border, strokeWidth: 1, vSizing: "fix" })];
      tabs.forEach(([label, icon]: string[], i: number) => { const active = i === 0, col = active ? c.primary : c.textSubtle;
        ops.push({ op: "board", ref: `t${i}`, parent: "root", name: `Tab / ${label}`, x: 0, y: 0, width: 72, height: 49, fill: null, layout: { direction: "column", align: "center", justify: "center", gap: 4 }, hSizing: "fill", vSizing: "fix" },
          { op: "icon", parent: `t${i}`, name: icon, icon: icon ?? "circle", size: 24, color: col, strokeWidth: active ? 2.25 : 1.75 },
          T(brand, "Caption", col, { parent: `t${i}`, name: "Label", text: label, fontWeight: active ? "600" : "500", letterSpacing: 0, fontSize: 11 })); });
      return ops; }
    case "button": return [...btn(brand, o.parent ?? "", "root", t.label ?? "Devam et", (o.variant as "primary" | "secondary" | "ghost") ?? "primary", "lg").map((op, i) => i === 0 ? { ...op, parent: o.parent, x: o.x, y: o.y, ...(o.width ? { width: o.width, hSizing: "fix" } : {}) } : op)];
    case "text-field": return [root("Text Field", 90, null, { direction: "column", gap: 8 }, { vSizing: "auto" }),
      T(brand, "Small", c.text, { parent: "root", name: "Label", text: t.label ?? "E-posta", fontWeight: "500" }),
      { op: "board", ref: "box", parent: "root", name: "Input", x: 0, y: 0, width: W, height: 48, fill: c.bg, radius: brand.radius, stroke: c.border, strokeWidth: 1, layout: { direction: "row", align: "center", gap: 10, padding: [0, 14, 0, 14] }, hSizing: "fill", vSizing: "fix" },
      { op: "icon", parent: "box", name: "icon", icon: t.icon ?? "mail", size: 20, color: c.textSubtle },
      T(brand, "Body", c.textMuted, { parent: "box", name: "Placeholder", text: t.placeholder ?? "ornek@sirket.com" }),
      T(brand, "Caption", c.textMuted, { parent: "root", name: "Helper", text: t.helper ?? "Size asla spam göndermeyiz.", letterSpacing: 0, fontWeight: "400" })];
    case "list-item": return [root("List Item", 72, c.bg, { direction: "row", align: "center", gap: 14, padding: [12, 16, 12, 16] }, { vSizing: "auto" }),
      { op: "board", ref: "av", parent: "root", name: "Leading", x: 0, y: 0, width: 44, height: 44, fill: c.primarySoft, radius: 999, layout: { direction: "row", align: "center", justify: "center" } },
      { op: "icon", parent: "av", name: "icon", icon: t.icon ?? "file-text", size: 20, color: c.primary },
      { op: "board", ref: "txt", parent: "root", name: "Text", x: 0, y: 0, width: 200, height: 40, fill: null, layout: { direction: "column", gap: 2 }, hSizing: "fill", vSizing: "auto" },
      T(brand, "Body", c.text, { parent: "txt", name: "Title", text: t.title ?? "Q4 raporu", fontWeight: "600", hSizing: "fill", width: 200 }),
      T(brand, "Small", c.textMuted, { parent: "txt", name: "Subtitle", text: t.subtitle ?? "2 saat önce · 1,2 MB", hSizing: "fill", width: 200 }),
      { op: "icon", parent: "root", name: "chevron", icon: "chevron-right", size: 20, color: c.textSubtle }];
    case "card": return [root("Card", 320, c.bg, { direction: "column", gap: 0 }, { radius: brand.radius * 2, stroke: c.border, strokeWidth: 1, vSizing: "auto", shadow: shadowSoft(c.text), clip: true }),
      { op: "rect", parent: "root", name: "Media", x: 0, y: 0, width: W, height: Math.round(W * 0.56), fill: c.surfaceAlt, hSizing: "fill" },
      { op: "board", ref: "body", parent: "root", name: "Body", x: 0, y: 0, width: W, height: 120, fill: null, layout: { direction: "column", gap: 8, padding: 20 }, hSizing: "fill", vSizing: "auto" },
      T(brand, "Overline", c.primary, { parent: "body", name: "Tag", text: (t.tag ?? "Rehber").toLocaleUpperCase("tr") }),
      T(brand, "H4", c.text, { parent: "body", name: "Title", text: t.title ?? "Sakin bir tasarım süreci kurmanın 5 yolu", hSizing: "fill", width: W - 40 }),
      T(brand, "Small", c.textMuted, { parent: "body", name: "Text", text: t.text ?? "Ekibinizin odaklanmasını sağlayan küçük ama etkili alışkanlıklar.", hSizing: "fill", width: W - 40 })];
    case "search-bar": return [root("Search", 48, c.surfaceAlt, { direction: "row", align: "center", gap: 10, padding: [0, 14, 0, 14] }, { radius: brand.radius, vSizing: "fix" }),
      { op: "icon", parent: "root", name: "search", icon: "search", size: 20, color: c.textMuted },
      T(brand, "Body", c.textMuted, { parent: "root", name: "Placeholder", text: t.placeholder ?? "Ara" })];
  }
  throw new Error(`Bilinmeyen uygulama bileşeni: ${kind}. Seçenekler: app-bar, tab-bar, button, text-field, list-item, card, search-bar`);
}
