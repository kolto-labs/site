import type { ReactNode } from 'react';

/** Page title block with a DOS-prompt breadcrumb. */
export function PageHead({ dir, title, lede, backdrop }: { dir: string; title: string; lede?: ReactNode; backdrop?: string }) {
  return (
    <header className={`page-head${backdrop ? ' page-head--backdrop' : ''}`}>
      {backdrop ? (
        <div className="page-head__backdrop" aria-hidden="true">
          <img src={backdrop} alt="" width={1920} height={1080} loading="lazy" decoding="async" />
        </div>
      ) : null}
      <p className="page-head__path" aria-hidden="true">
        K:\KOLTO\<b>{dir.toUpperCase()}</b>&gt;<span className="cursor">_</span>
      </p>
      <h1>{title}</h1>
      {lede ? <div className="page-head__lede">{lede}</div> : null}
    </header>
  );
}
