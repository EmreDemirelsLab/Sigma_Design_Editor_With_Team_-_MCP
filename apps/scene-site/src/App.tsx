import { useCallback, useEffect, useRef, useState } from "react";
import { ParticleEngine } from "./particles/engine";
import { SCENES, SITE } from "./scenes";

const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null); const engine = useRef<ParticleEngine | null>(null);
  const [i, setI] = useState(() => { const h = Number(location.hash.slice(1)); return Number.isInteger(h) && h >= 0 && h < SCENES.length ? h : 0; });
  const lock = useRef(0); const s = SCENES[i];

  const go = useCallback((n: number) => { setI(cur => { const next = Math.max(0, Math.min(SCENES.length - 1, n)); return next === cur ? cur : next; }); }, []);
  const step = useCallback((d: number) => { const now = performance.now(); if (now - lock.current < 900) return; lock.current = now; setI(cur => Math.max(0, Math.min(SCENES.length - 1, cur + d))); }, []);

  // motor
  useEffect(() => {
    if (!canvas.current) return; let e: ParticleEngine;
    try { e = new ParticleEngine({ canvas: canvas.current, reducedMotion: reduced }); } catch { return; } // WebGL yoksa sayfa yine çalışır
    engine.current = e;
    document.fonts.ready.then(() => e.prewarm(SCENES.map(x => x.shape)));
    return () => { e.dispose(); engine.current = null; };
  }, []);
  // sahne değişimi
  useEffect(() => {
    engine.current?.show({ shape: s.shape, color: s.particle, rotation: s.rotation, scale: s.scale }, i === 0 ? "center" : "side");
    document.documentElement.style.setProperty("--glow-a", s.glowA); document.documentElement.style.setProperty("--glow-b", s.glowB);
    history.replaceState(null, "", i ? `#${i}` : location.pathname);
  }, [i, s]);
  // gezinme: tekerlek, klavye, dokunma
  useEffect(() => {
    const onWheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) > 18) step(e.deltaY > 0 ? 1 : -1); };
    const onKey = (e: KeyboardEvent) => { if (["ArrowDown", "PageDown", " ", "ArrowRight"].includes(e.key)) { e.preventDefault(); step(1); } if (["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); step(-1); } if (e.key === "Home") go(0); if (e.key === "End") go(SCENES.length - 1); };
    let y0 = 0; const ts = (e: TouchEvent) => { y0 = e.touches[0].clientY; }; const te = (e: TouchEvent) => { const d = y0 - e.changedTouches[0].clientY; if (Math.abs(d) > 50) step(d > 0 ? 1 : -1); };
    window.addEventListener("wheel", onWheel, { passive: true }); window.addEventListener("keydown", onKey); window.addEventListener("touchstart", ts, { passive: true }); window.addEventListener("touchend", te, { passive: true });
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("keydown", onKey); window.removeEventListener("touchstart", ts); window.removeEventListener("touchend", te); };
  }, [step, go]);

  const intro = i === 0;
  return (
    <div className="stage">
      <div className="aurora" aria-hidden><span className="blob a" /><span className="blob b" /><span className="vignette" /></div>
      <canvas ref={canvas} className="particles" aria-hidden />

      <header className="top">
        <a className="logo" href="#" onClick={e => { e.preventDefault(); go(0); }} aria-label={SITE.brand}>
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><path d="M16 4a12 12 0 1 0 11.6 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /><circle cx="25.5" cy="7.5" r="2.4" fill="#ff7a1a" /></svg>
          <span>{SITE.brand}</span>
        </a>
        <div className="top-right">
          <a className="glass pill small" href={SITE.chat.href}>{SITE.chat.label} <span aria-hidden>→</span></a>
          <p className="tagline">{SITE.tagline}</p>
        </div>
      </header>

      <main className={intro ? "content center" : "content"} key={s.id} aria-live="polite">
        {s.eyebrow && <p className={intro ? "eyebrow chip glass" : "eyebrow"}>{s.eyebrow}</p>}
        {intro ? <h1 className="display">{s.title}</h1> : <h2 className="title">{s.title}</h2>}
        {s.body && <p className="body">{s.body}</p>}
        {s.cta && (intro
          ? <button className="orb" onClick={() => go(1)} aria-label={s.cta.label}><span className="orb-core" /><span className="orb-label">{s.cta.label}</span></button>
          : <a className={s.cta.primary ? "glass pill primary" : "glass pill"} href={s.cta.href ?? "#"}>{s.cta.label} {s.cta.primary && <span aria-hidden>→</span>}</a>)}
      </main>

      {!intro && <nav className="stepper" aria-label="Sahneler">
        <button className="round glass" onClick={() => step(-1)} aria-label="Önceki">↑</button>
        <button className="round glass" onClick={() => step(1)} aria-label="Sonraki" disabled={i === SCENES.length - 1}>↓</button>
      </nav>}

      <footer className="bottom">
        <span className="where"><span className="dot" />{s.label} <span className="count">{String(i).padStart(2, "0")} / {String(SCENES.length - 1).padStart(2, "0")}</span></span>
        <span className="progress" aria-hidden>{SCENES.map((x, k) => <button key={x.id} className={k === i ? "tick on" : "tick"} onClick={() => go(k)} aria-label={x.label} />)}</span>
        <span className="links">{SITE.links.map(l => <a key={l.label} href={l.href}>{l.label}</a>)}</span>
      </footer>
    </div>
  );
}
