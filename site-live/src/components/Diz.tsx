import { useProjects } from '../lib/useProjects';

/** FILE_ID.DIZ capsule: 45 columns, 10 lines, the BBS file-lister blurb. */
export function dizText(released: number, tracked: number): string {
  const W = 45;
  const row = (t: string) => `█  ${t.padEnd(W - 4)}█`;
  const lines = [
    '▄'.repeat(W),
    row('K O L T O   L A B S'),
    row('life support for the odyssey engine'),
    row(''),
    row('tools for KotOR I & II'),
    row(`${released} released / ${tracked} tracked`),
    row(''),
    row('github.com/kolto-labs'.padEnd(W - 13) + '[01/01]'),
    '▀'.repeat(W),
  ];
  return lines.join('\n');
}

export function Diz() {
  const { listed, lab } = useProjects();
  const released = listed.filter((p) => p.status === 'released').length;
  return (
    <figure className="diz">
      <figcaption className="diz__cap">FILE_ID.DIZ</figcaption>
      <pre className="diz__pre" aria-label="File description: Kolto Labs, life support for the Odyssey engine. Tools for KotOR I and II.">
        <span aria-hidden="true">{dizText(released, listed.length + lab.length)}</span>
      </pre>
    </figure>
  );
}
