import { content, LINKS } from '../content';
import { PageHead } from '../components/PageHead';
import { Rule } from '../components/Scramble';
import { Md } from '../components/Md';
import { PolicyLink } from '../components/Policies';

export default function Join() {
  const { join } = content;
  return (
    <div className="page">
      <PageHead dir="join" title="Join the lab" lede={<Md source={join.intro} />} />

      <section className="section" aria-labelledby="wanted">
        <div className="wanted" data-reveal>
          <h2 className="wanted__title" id="wanted">
            We are looking for
          </h2>
          <ul className="wanted__list">
            {join.lookingFor.map((w) => (
              <li key={w.role}>
                <span className="wanted__role">{w.role}</span>
                <span className="wanted__detail">{w.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="join-steps">
        <Rule id="join-steps">How to start</Rule>
        <ol className="steps">
          {join.steps.map((s) => (
            <li key={s}>
              <Md source={s} inline as="span" />
            </li>
          ))}
        </ol>
        <div className="btn-row">
          <a className="btn btn--primary" href={LINKS.github}>
            Open GitHub
          </a>
        </div>
      </section>

      <p className="section">
        Read the <PolicyLink id="re-policy">reverse-engineering policy</PolicyLink> and <PolicyLink id="code-of-conduct">code of conduct</PolicyLink> before
        contributing.
      </p>
    </div>
  );
}
