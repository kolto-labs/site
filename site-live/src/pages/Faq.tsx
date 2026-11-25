import { useEffect } from 'react';
import { content } from '../content';
import { PageHead } from '../components/PageHead';
import { Md } from '../components/Md';

export default function Faq() {
  // A link to /faq/#donations (the footer's Support link) opens that answer.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (el instanceof HTMLDetailsElement) el.open = true;
  }, []);
  return (
    <div className="page page--faq">
      <PageHead dir="faq" title="Frequently asked questions" lede={<p>Answers to questions we get, or expect to.</p>} />
      <div className="faq narrow">
        {content.faq.map((f, i) => (
          <details key={f.q} id={f.id} open={i === 0}>
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
