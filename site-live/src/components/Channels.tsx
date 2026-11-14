import { content } from '../content';

/** Release channels, named after medpacs. Only Medpac (stable) exists so far. */
export function Channels({ compact = false }: { compact?: boolean }) {
  if (!content.releaseChannels?.length) return null;
  if (compact) {
    return (
      <dl className="chan-list">
        {content.releaseChannels.map((c) => (
          <div key={c.name} className="chan-list__item">
            <dt>
              <span className="chan-list__name">{c.name}</span>{' '}
              <span className={`chan chan--${c.channel.toLowerCase()}`}>{c.channel}</span>
            </dt>
            <dd>{c.desc}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <table className="channels">
      <caption className="sr-only">Release channel</caption>
      <thead>
        <tr>
          <th scope="col">Channel</th>
          <th scope="col">Track</th>
          <th scope="col">What you get</th>
        </tr>
      </thead>
      <tbody>
        {content.releaseChannels.map((c) => (
          <tr key={c.name}>
            <th scope="row">{c.name}</th>
            <td>
              <span className={`chan chan--${c.channel.toLowerCase()}`}>{c.channel}</span>
            </td>
            <td>{c.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
