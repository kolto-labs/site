import { Link } from 'react-router';
import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { Rule } from '../components/Scramble';
import { Md } from '../components/Md';

export default function About() {
  const { sections } = content.about;
  // the copy may already carry its own non-affiliation section
  const hasLegal = sections.some((s) => /affiliat/i.test(s.heading));
  return (
    <div className="page">
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
            {hasLegal ? null : (
              <li>
                <a href="#legal">Non-affiliation</a>
              </li>
            )}
          </ol>
        </nav>
        <div className="doc__body">
          {sections.map((s) => (
            <section key={s.id} className="doc__section" aria-labelledby={s.id}>
              <Rule id={s.id}>{s.heading}</Rule>
              <Md source={s.body} />
            </section>
          ))}

          {hasLegal ? null : (
            <section className="doc__section" aria-labelledby="legal">
              <Rule id="legal">Non-affiliation</Rule>
              <div className="legal-box">
                <p>
                  <Md source={content.disclaimer} inline as="span" />
                </p>
              </div>
              <p className="muted">
                Questions? The <Link to="/faq/">FAQ</Link> covers the common ones.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
