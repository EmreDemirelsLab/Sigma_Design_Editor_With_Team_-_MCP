// Marka kiti: OKLCH tabanlı renk rampaları (algısal olarak eşit adımlar) ve modüler tipografi ölçeği.
import { contrast } from "./lint.js";

// ---------- sRGB ⇄ OKLab ⇄ OKLCH (Björn Ottosson) ----------
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function hexToOklch(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16); const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function oklchToRgb(L: number, C: number, H: number): number[] {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** Gamut dışındaysa kromayı düşürerek sRGB'ye sığdırır. */
function oklchToHex(L: number, C: number, H: number): string {
  let c = C; let rgb = oklchToRgb(L, c, H);
  for (let i = 0; i < 40 && rgb.some(v => v < -0.0005 || v > 1.0005); i++) { c *= 0.92; rgb = oklchToRgb(L, c, H); }
  return "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, fromLin(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, "0")).join("");
}

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const LIGHT = [0.975, 0.945, 0.885, 0.805, 0.715, 0.635, 0.55, 0.465, 0.38, 0.3, 0.22];
const CHROMA = [0.12, 0.22, 0.42, 0.65, 0.85, 1, 0.98, 0.9, 0.78, 0.65, 0.5];

/** Bir renkten 50-950 rampası. Verilen renk açıklığına en yakın basamağa birebir yerleşir (marka rengi kayıpsız korunur). */
export function ramp(hex: string): { step: number; hex: string }[] {
  const [L, C, H] = hexToOklch(hex.toLowerCase());
  const nearest = LIGHT.reduce((best, v, i) => (Math.abs(v - L) < Math.abs(LIGHT[best] - L) ? i : best), 0);
  return STEPS.map((step, i) => ({ step, hex: i === nearest ? hex.toLowerCase() : oklchToHex(LIGHT[i] + (L - LIGHT[nearest]) * Math.max(0, 1 - Math.abs(i - nearest) / 4), C * CHROMA[i] / CHROMA[nearest], H) }));
}
export const neutralRamp = (hex: string) => { const [, , H] = hexToOklch(hex); return STEPS.map((step, i) => ({ step, hex: oklchToHex(LIGHT[i], 0.012 + 0.006 * (i / 10), H) })); };

/** Metin için zemin üzerinde en okunur renk (koyu ya da açık). */
export const onColor = (bg: string, dark = "#0b1220", light = "#ffffff") => (contrast(dark, bg) >= contrast(light, bg) ? dark : light);

export interface TypeStep { name: string; size: number; weight: string; lineHeight: number; letterSpacing: number; family: string }
/** Modüler tipografi ölçeği (varsayılan oran 1.25 — Major Third). Başlıklar sıkı, gövde ferah. */
export function typeScale(base = 16, ratio = 1.25, heading = "Inter", body = "Inter"): TypeStep[] {
  const s = (k: number) => Math.round(base * ratio ** k);
  return [
    { name: "Display", size: s(5), weight: "700", lineHeight: 1.05, letterSpacing: -Math.round(s(5) * 0.025 * 10) / 10, family: heading },
    { name: "H1", size: s(4), weight: "700", lineHeight: 1.1, letterSpacing: -Math.round(s(4) * 0.02 * 10) / 10, family: heading },
    { name: "H2", size: s(3), weight: "600", lineHeight: 1.15, letterSpacing: -Math.round(s(3) * 0.015 * 10) / 10, family: heading },
    { name: "H3", size: s(2), weight: "600", lineHeight: 1.25, letterSpacing: -0.2, family: heading },
    { name: "H4", size: s(1), weight: "600", lineHeight: 1.3, letterSpacing: 0, family: heading },
    { name: "Body L", size: s(0) + 2, weight: "400", lineHeight: 1.6, letterSpacing: 0, family: body },
    { name: "Body", size: s(0), weight: "400", lineHeight: 1.6, letterSpacing: 0, family: body },
    { name: "Small", size: Math.round(base * 0.875), weight: "400", lineHeight: 1.5, letterSpacing: 0, family: body },
    { name: "Caption", size: Math.round(base * 0.75), weight: "500", lineHeight: 1.4, letterSpacing: 0.4, family: body },
    { name: "Overline", size: Math.round(base * 0.75), weight: "600", lineHeight: 1.3, letterSpacing: 1.6, family: body },
  ];
}

export interface Brand { primary: string; accent?: string; neutralFrom?: string; headingFont: string; bodyFont: string; radius: number }
export interface Palette { primary: { step: number; hex: string }[]; accent?: { step: number; hex: string }[]; neutral: { step: number; hex: string }[]; semantic: Record<string, string> }
export function palette(b: Brand): Palette {
  return { primary: ramp(b.primary), ...(b.accent ? { accent: ramp(b.accent) } : {}), neutral: neutralRamp(b.neutralFrom ?? b.primary),
    semantic: { success: "#16a34a", warning: "#d97706", danger: "#dc2626", info: "#2563eb" } };
}
/** Şablonların kullandığı anlamsal renkler. */
export function themeColors(b: Brand) {
  const p = palette(b); const N = (s: number) => p.neutral.find(x => x.step === s)!.hex;
  const primary = b.primary.toLowerCase(), accent = (b.accent ?? b.primary).toLowerCase();
  return { primary, onPrimary: onColor(primary), accent, onAccent: onColor(accent), primarySoft: p.primary.find(x => x.step === 50)!.hex, primaryTint: p.primary.find(x => x.step === 200)!.hex, primaryStrong: p.primary.find(x => x.step === 700)!.hex,
    bg: "#ffffff", surface: N(50), surfaceAlt: N(100), border: N(200), text: N(950), textMuted: N(700), textSubtle: N(600), inverseBg: N(950), inverseText: "#ffffff" };
}
