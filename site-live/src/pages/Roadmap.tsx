import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { KoltoTanks } from '../placements/roadmap/KoltoTanks';
import { phaseLabel } from '../lib/nfo';

const LABEL = { done: 'DONE', active: 'ACTIVE', next: 'NEXT', later: 'LATER' } as const;

export default function Roadmap() {
  return (
    <div className="page">
      <PageHead
        dir="roadmap"
        title="Roadmap"
        lede={<p>Where things stand.</p>}
      />
      <ol className="roadmap">
        {content.roadmap.map((ph) => {
          return (
            <li key={ph.phase} className={`roadmap__phase roadmap__phase--${ph.status}`} data-reveal>
              <div className="roadmap__rail" aria-hidden="true" />
              <header className="roadmap__head">
                <p className="roadmap__label">{phaseLabel(ph.phase)}</p>
                <h2 className="roadmap__title">{ph.title}</h2>
                <span className={`badge badge--${ph.status}`}>{LABEL[ph.status]}</span>
              </header>
              <KoltoTanks value={ph.progress} label={`${phaseLabel(ph.phase)}: ${ph.title} progress`} tone={ph.status} />
              <ul className="checklist">
                {ph.items.map((it) => (
                  <li key={it.text} className={it.done ? 'is-done' : undefined}>
                    <span className="checklist__box" aria-hidden="true">
                      {it.done ? '[x]' : '[ ]'}
                    </span>
                    <span className="sr-only">{it.done ? 'Done: ' : 'To do: '}</span>
                    {it.text}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
