import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { Rule } from '../components/Scramble';
import { Md } from '../components/Md';
import { screenshots } from '../content/screenshots';

const OFL = 'SIL Open Font License 1.1';

/** licenseFiles: the license texts served next to the fonts, from public/fonts/. */
const CREDITS: { name: string; by: string; license: string; licenseFiles?: [string, string][]; url: string; use: string }[] = [
  { name: 'Departure Mono', by: 'Helena Zhang', license: OFL, licenseFiles: [['text', '/fonts/DepartureMono-OFL.txt']], url: 'https://departuremono.com', use: 'Headings, menus, the text viewer and the hero scroller' },
  {
    name: 'IBM Plex Sans and Plex Mono',
    by: 'Mike Abbink at IBM, with Bold Monday',
    license: OFL,
    licenseFiles: [['Sans', '/fonts/IBMPlexSans-OFL.txt'], ['Mono', '/fonts/IBMPlexMono-OFL.txt']],
    url: 'https://github.com/IBM/plex',
    use: 'Body text and code',
  },
  { name: 'React', by: 'Meta', license: 'MIT', url: 'https://react.dev', use: 'Rendering' },
  { name: 'React Router', by: 'Remix and Shopify', license: 'MIT', url: 'https://reactrouter.com', use: 'Routing' },
  { name: 'marked', by: 'Christopher Jeffrey and the MarkedJS team', license: 'MIT', url: 'https://marked.js.org', use: 'Markdown' },
  { name: 'Vite', by: 'VoidZero and the Vite contributors', license: 'MIT', url: 'https://vite.dev', use: 'Build' },
];

const SHOT_CREDITS = [...new Map(screenshots.map((s) => [s.sourcePage + s.credit, s])).values()];

export default function Credits() {
  const { greets } = content;
  return (
    <div className="page">
      <PageHead
        dir="credits"
        title="Credits"
        lede={<p>The work we build on, and who did it.</p>}
      />

      <section className="section" aria-labelledby="prior-art">
        <Rule id="prior-art">Prior art</Rule>
        <ul className="greet-list">
          {greets.priorArt.map((g) => (
            <li key={g.name} data-reveal>
              <a className="greet-list__name" href={g.url}>
                {g.name}
              </a>
              {g.by ? <span className="greet-list__by">by {g.by}</span> : null}
              <Md source={g.why} />
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="communities">
        <Rule id="communities">Communities</Rule>
        <ul className="greet-list">
          {greets.communities.map((c) => (
            <li key={c.name} data-reveal>
              <a className="greet-list__name" href={c.url}>
                {c.name}
              </a>
              <Md source={c.why} />
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="credits">
        <Rule id="credits">This site</Rule>
        <p className="muted">Fonts are self-hosted. Apart from project details from GitHub, nothing is loaded from other servers.</p>
        <table className="credits">
          <caption className="sr-only">Fonts and libraries used on this site</caption>
          <thead>
            <tr>
              <th scope="col">Work</th>
              <th scope="col">By</th>
              <th scope="col">License</th>
              <th scope="col">Used for</th>
            </tr>
          </thead>
          <tbody>
            {CREDITS.map((c) => (
              <tr key={c.name}>
                <th scope="row">
                  <a href={c.url}>{c.name}</a>
                </th>
                <td>{c.by}</td>
                <td>
                  {c.license}
                  {c.licenseFiles ? (
                    <>
                      {' ('}
                      {c.licenseFiles.map(([label, href], i) => (
                        <span key={href}>
                          {i ? ', ' : null}
                          <a href={href}>{label}</a>
                        </span>
                      ))}
                      {')'}
                    </>
                  ) : null}
                </td>
                <td>{c.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          The logo, the music and the interface sounds are original.
        </p>
        <h3 className="sub-rule">Screenshots</h3>
        <p className="muted">
          Kolto screenshots from Star Wars: Knights of the Old Republic &copy; Lucasfilm Ltd. / BioWare, captured by the community members
          credited below. Used for commentary; not affiliated.
        </p>
        <ul className="shot-credits">
          {SHOT_CREDITS.map((s) => (
            <li key={s.sourcePage + s.credit}>
              <a href={s.sourcePage} target="_blank" rel="noopener nofollow">
                {s.credit}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
