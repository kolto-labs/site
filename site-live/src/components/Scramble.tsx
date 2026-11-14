import { useEffect, useRef, useState } from 'react';

const GLYPHS = '░▒▓█▀▄■<>/\\|=+*#%$&@01';

/**
 * Text that "decrypts" into place the first time it scrolls into view.
 * The accessible name is always the real text (sr-only); the animated copy is aria-hidden.
 * Server render and reduced-motion both show the final text immediately.
 */
export function Scramble({ text, duration = 650 }: { text: string; duration?: number }) {
  const [shown, setShown] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setShown(text);
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    let raf = 0;
    let started = false;
    const run = () => {
      const t0 = performance.now();
      const chars = [...text];
      const frame = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const out = chars
          .map((c, i) => {
            if (c === ' ') return ' ';
            const lock = (i / chars.length) * 0.7 + 0.3;
            return p >= lock ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          })
          .join('');
        setShown(out);
        if (p < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!started && entries.some((e) => e.isIntersecting)) {
          started = true;
          io.disconnect();
          run();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text, duration]);

  return (
    <span ref={ref} className="scramble">
      <span className="scramble__sizer" aria-hidden="true">
        {text}
      </span>
      <span className="sr-only">{text}</span>
      <span className="scramble__shown" aria-hidden="true">
        {shown}
      </span>
    </span>
  );
}

/** Terminal-inspired section rule with a readable text label. */
export function Rule({ children, id, level = 2 }: { children: string; id?: string; level?: 2 | 3 }) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <Tag className="rule" id={id} data-reveal>
      <span className="rule__label">
        <span className="rule__text">
          <Scramble text={children} />
        </span>
      </span>
    </Tag>
  );
}
