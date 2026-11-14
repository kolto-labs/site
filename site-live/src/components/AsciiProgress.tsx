interface Props {
  value: number | null;
  label: string;
  cells?: number;
  tone?: 'done' | 'active' | 'next' | 'later';
}

export function asciiBar(value: number, cells = 24): string {
  const v = Math.max(0, Math.min(100, value));
  const exact = (v / 100) * cells;
  const full = Math.floor(exact);
  const frac = exact - full;
  const partial = full < cells && frac > 0 ? (frac < 0.34 ? '░' : frac < 0.67 ? '▒' : '▓') : '';
  return '█'.repeat(full) + partial + '·'.repeat(cells - full - (partial ? 1 : 0));
}

/** [██████████▓·········] 47%  — progressbar semantics, glyphs hidden from AT. */
export function AsciiProgress({ value, label, cells = 24, tone = 'active' }: Props) {
  if (value === null) {
    return (
      <div className={`ascii-bar ascii-bar--${tone} ascii-bar--unknown`}>
        <span aria-hidden="true" className="ascii-bar__track">
          [{(tone === 'active' ? '▒░' : '··').repeat(cells / 2)}]
        </span>
        <span className="ascii-bar__pct">{tone === 'active' ? 'in progress' : 'not started'}</span>
      </div>
    );
  }
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className={`ascii-bar ascii-bar--${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <span aria-hidden="true" className="ascii-bar__track">
        [<span className="ascii-bar__fill">{asciiBar(v, cells).replace(/·+$/, '')}</span>
        <span className="ascii-bar__rest">{asciiBar(v, cells).match(/·+$/)?.[0] ?? ''}</span>]
      </span>
      <span className="ascii-bar__pct" aria-hidden="true">
        {String(v).padStart(3, ' ')}%
      </span>
    </div>
  );
}
