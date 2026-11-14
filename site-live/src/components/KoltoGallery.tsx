import { useCallback, useEffect, useRef, useState } from 'react';
import { Rule } from './Scramble';
import { screenshots, screenshotBySlug, type Screenshot } from '../content/screenshots';

const FEATURE = 'kolto-ward-02';
const feature = screenshotBySlug(FEATURE)!;
const rest = screenshots.filter((s) => s.slug !== FEATURE);
const ordered = [feature, ...rest];

const src800 = (s: Screenshot) => `/img/kolto/${s.slug}-800.webp`;
const srcFull = (s: Screenshot) => `/img/kolto/${s.slug}.webp`;

function Credit({ s }: { s: Screenshot }) {
  return (
    <>
      <span className="specimen__shows">{s.shows}</span>
      <span className="specimen__credit">
        <a href={s.sourcePage} target="_blank" rel="noopener nofollow">
          {s.credit}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </span>
    </>
  );
}

function Specimen({ s, sizes, big, onOpen }: { s: Screenshot; sizes: string; big?: boolean; onOpen: (slug: string) => void }) {
  return (
    <figure className={`specimen${big ? ' specimen--feature' : ''}`}>
      <button type="button" className="specimen__frame" onClick={() => onOpen(s.slug)} aria-label={`Enlarge: ${s.shows}`} aria-haspopup="dialog">
        <img
          src={src800(s)}
          srcSet={`${src800(s)} 800w, ${srcFull(s)} ${s.width}w`}
          sizes={sizes}
          width={s.width}
          height={s.height}
          alt={s.shows}
          loading="lazy"
          decoding="async"
        />
        <span className="specimen__tape specimen__tape--tl" aria-hidden="true">
          {s.slug.toUpperCase()}
        </span>
        <span className="specimen__tape specimen__tape--br" aria-hidden="true">
          {s.width}x{s.height}
        </span>
      </button>
      <figcaption className="specimen__cap">
        <Credit s={s} />
      </figcaption>
    </figure>
  );
}

function Lightbox({ index, onIndex, onClose }: { index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const s = ordered[index];
  const n = ordered.length;

  // The dialog unmounts instead of calling close(), so the browser never hands focus back.
  // Remember the opener and return focus to it on the way out.
  useEffect(() => {
    const d = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
      opener?.focus();
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onIndex((index + 1) % n);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onIndex((index - 1 + n) % n);
    }
  };

  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-labelledby="lightbox-cap"
      onKeyDown={onKey}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="lightbox__bar">
        <span className="lightbox__tape" aria-hidden="true">
          {s.slug.toUpperCase()} {index + 1}/{n}
        </span>
        <button type="button" className="lightbox__btn" onClick={onClose} autoFocus>
          [ CLOSE ]
        </button>
      </div>
      <div className="lightbox__stage">
        <button type="button" className="lightbox__btn lightbox__nav" onClick={() => onIndex((index - 1 + n) % n)} aria-label="Previous screenshot">
          &lt;
        </button>
        <img key={s.slug} src={srcFull(s)} width={s.width} height={s.height} alt={s.shows} decoding="async" />
        <button type="button" className="lightbox__btn lightbox__nav" onClick={() => onIndex((index + 1) % n)} aria-label="Next screenshot">
          &gt;
        </button>
      </div>
      <p className="lightbox__cap" id="lightbox-cap" aria-live="polite">
        <Credit s={s} />
      </p>
    </dialog>
  );
}

export function KoltoGallery() {
  const [open, setOpen] = useState<number | null>(null);
  const openSlug = useCallback((slug: string) => setOpen(ordered.findIndex((s) => s.slug === slug)), []);

  return (
    <section className="section gallery" aria-labelledby="gallery-title">
      <Rule id="gallery-title">SPECIMENS // KOLTO</Rule>
      <p className="gallery__kicker">Screenshots from Knights of the Old Republic</p>
      <div className="gallery__grid">
        <Specimen s={feature} big sizes="(min-width: 1240px) 1120px, calc(100vw - 32px)" onOpen={openSlug} />
        {rest.map((s) => (
          <Specimen key={s.slug} s={s} sizes="(min-width: 1240px) 360px, (min-width: 700px) 33vw, calc(100vw - 32px)" onOpen={openSlug} />
        ))}
      </div>
      <p className="gallery__legal muted small">
        Screenshots from Star Wars: Knights of the Old Republic &copy; Lucasfilm Ltd. / BioWare, captured by the community members credited. Used
        for commentary; not affiliated.
      </p>
      {open !== null ? (
        <Lightbox
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
