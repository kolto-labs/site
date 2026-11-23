import { Link } from 'react-router';
import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { Rule } from '../components/Scramble';
import { Md } from '../components/Md';

const PLAY_RUNTIME_URL = (import.meta.env.VITE_PLAY_RUNTIME_URL || '').trim();

export default function Play() {
  const play = content.play;
  if (!play) return null;
  return (
    <div className="page">
      <PageHead
        dir="play"
        title="Play KOTOR"
        lede={<p>{PLAY_RUNTIME_URL ? 'Choose an engine and start Kolto Tank with your own copy of KOTOR.' : play.lede}</p>}
      />
      <div className="doc__body narrow">
        {PLAY_RUNTIME_URL ? (
          <section className="doc__section" aria-labelledby="play-now">
            <Rule id="play-now">Play now</Rule>
            <div className="btn-row">
              <a
                className="btn btn--primary"
                href={PLAY_RUNTIME_URL}
                target="_blank"
                rel="noreferrer"
              >
                Play Kolto Tank
              </a>
            </div>
          </section>
        ) : null}
        {play.sections.map((s) => (
          <section key={s.id} className="doc__section" aria-labelledby={s.id}>
            <Rule id={s.id}>{s.heading}</Rule>
            <Md source={s.body} />
          </section>
        ))}
        <div className="btn-row">
          <Link className={PLAY_RUNTIME_URL ? 'btn' : 'btn btn--primary'} to="/projects/#kolto-tank">
            About Kolto Tank
          </Link>
          <Link className="btn" to="/roadmap/">
            Roadmap
          </Link>
        </div>
      </div>
    </div>
  );
}
