import { Link } from 'react-router';
import { content } from '../content';
import { useProjects } from '../lib/useProjects';
import { Hero } from '../components/Hero';
import { Rule } from '../components/Scramble';
import { NfoViewer } from '../components/NfoViewer';
import { ReleaseCard } from '../components/ReleaseCard';
import { AsciiProgress } from '../components/AsciiProgress';
import { phaseLabel } from '../lib/nfo';
import { Diz } from '../components/Diz';
import { Channels } from '../components/Channels';
import { KoltoGallery } from '../components/KoltoGallery';
import { Md } from '../components/Md';

const PHASE_BADGE = { done: 'DONE', active: 'ACTIVE', next: 'NEXT', later: 'LATER' } as const;

export default function Home() {
  const { listed, lab } = useProjects();
  const released = listed.filter((p) => p.status === 'released');
  const onGithub = listed.filter((p) => p.status !== 'released');
  const tank = lab.find((p) => p.slug === 'kolto-tank');
  const inDev = lab.filter((p) => p.status === 'in-development' && p.slug !== 'kolto-tank');
  const planned = lab.filter((p) => p.status === 'planned');
  const greetNames = [...content.greets.priorArt.map((g) => g.name), ...content.greets.communities.map((c) => c.name)];

  return (
    <>
      <Hero />
      <div className="page">
        <KoltoGallery />

        <section className="section home-nfo" aria-labelledby="home-nfo">
          <Rule id="home-nfo">Kolto.txt</Rule>
          <div className="home-nfo__grid">
            <NfoViewer title="KOLTO LABS" text={content.homeNfo} clampRows={34} />
            <aside className="home-nfo__side" aria-label="At a glance">
              <Diz />
              <div className="home-nfo__channels">
                <h3 className="mini-head">Release channel</h3>
                <Channels compact />
              </div>
            </aside>
          </div>
        </section>

        {tank ? (
          <section className="section" aria-labelledby="home-tank">
            <Rule id="home-tank">Kolto Tank</Rule>
            <Md source={tank.description} />
            <div className="btn-row">
              <Link className="btn btn--primary" to="/play/">
                Play in your browser
              </Link>
              <Link className="btn" to="/projects/#kolto-tank">
                About Kolto Tank
              </Link>
            </div>
          </section>
        ) : null}

        <section className="section" aria-labelledby="home-releases">
          <Rule id="home-releases">Released tools</Rule>
          <div className="release-grid release-grid--4">
            {released.map((p) => (
              <ReleaseCard key={p.slug} project={p} />
            ))}
          </div>
          {onGithub.length ? (
            <>
              <h3 className="sub-rule">Browse more on GitHub</h3>
              <div className="release-grid">
                {onGithub.map((p) => (
                  <ReleaseCard key={p.slug} project={p} />
                ))}
              </div>
            </>
          ) : null}
          {lab.length ? <h3 className="sub-rule">Also in the lab: not public yet</h3> : null}
          {inDev.length ? (
            <>
              <div className="release-grid">
                {inDev.map((p) => (
                  <ReleaseCard key={p.slug} project={p} lab />
                ))}
              </div>
            </>
          ) : null}
          {planned.length ? (
            <p className="home-planned">
              <span className="muted">On the bench: </span>
              {planned.map((p, i) => (
                <span key={p.slug}>
                  {i ? <span aria-hidden="true"> / </span> : null}
                  <Link to={`/projects/#${p.slug}`}>{p.name}</Link>
                  <span className="muted"> ({p.tagline.replace(/\.$/, '')})</span>
                </span>
              ))}
            </p>
          ) : null}
        </section>

        <section className="section" aria-labelledby="home-roadmap">
          <Rule id="home-roadmap">Roadmap</Rule>
          <ol className="phase-table">
            {content.roadmap.map((ph) => (
              <li key={ph.phase} className={`phase-table__row phase-table__row--${ph.status}`} data-reveal>
                <span className="phase-table__phase">{phaseLabel(ph.phase)}</span>
                <h3 className="phase-table__title">{ph.title}</h3>
                <span className={`badge badge--${ph.status}`}>{PHASE_BADGE[ph.status]}</span>
                <AsciiProgress value={ph.progress} label={`${phaseLabel(ph.phase)}: ${ph.title}`} tone={ph.status} cells={20} />
              </li>
            ))}
          </ol>
          <p>
            <Link to="/roadmap/" className="arrow-link">
              Full roadmap
            </Link>
          </p>
        </section>

        <section className="section" aria-labelledby="home-credits">
          <Rule id="home-credits">Credits</Rule>
          <p className="greets-line">
            {greetNames.map((n, i) => (
              <span key={n}>
                {i ? <span className="greets-line__sep" aria-hidden="true"> ░ </span> : null}
                <span className="greets-line__name">{n}</span>
                {i < greetNames.length - 1 ? <span className="sr-only">,</span> : null}
              </span>
            ))}
          </p>
          <p className="muted">
            We build on their work. <Link to="/credits/">Read who they are and what they built</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
