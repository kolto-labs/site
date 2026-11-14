import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { Md } from '../components/Md';

export default function Faq() {
  return (
    <div className="page page--faq">
      <PageHead dir="faq" title="Frequently asked questions" lede={<p>Answers to questions we get, or expect to.</p>} />
      <div className="faq narrow">
        {content.faq.map((f, i) => (
          <details key={f.q} open={i === 0}>
            <summary>{f.q}</summary>
            <div className="faq__a">
              <Md source={f.a} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
