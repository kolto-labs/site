import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { Rule } from '../components/Scramble';
import { Md } from '../components/Md';

export default function About() {
  const { sections } = content.about;
  return (
    <div className="page page--about">
      <PageHead dir="about" backdrop="/img/kolto/kolto-ward-02-800.webp" title="About Kolto Labs" />
      <div className="doc">
        <nav className="doc__toc" aria-label="On this page">
          <p className="doc__toc-title" aria-hidden="true">
            INDEX
          </p>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="doc__body">
          {sections.map((s) => (
            <section key={s.id} className="doc__section" aria-labelledby={s.id}>
              <Rule id={s.id}>{s.heading}</Rule>
              <Md source={s.body} />
            </section>
          ))}

        </div>
      </div>
    </div>
  );
}
