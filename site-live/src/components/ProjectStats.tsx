import type { JSX } from 'react';
import type { ProjectsAggregate } from '../content/project-contract';
import { selectRespectableCharts, type BarRow, type ChartSpec } from '../content/stats-gate';
import '../styles/stats.css';

const nf = new Intl.NumberFormat('en-US');

function Bars({ rows }: { rows: BarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="stats-bars">
      {rows.map((r) => (
        <li key={r.slug} className="stats-bar">
          <span className="stats-bar__label">{r.label}</span>
          <svg className="stats-bar__svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect className="stats-bar__track" x="0" y="0" width="100" height="10" />
            <rect className="stats-bar__fill" x="0" y="0" width={Math.max(1, (r.value / max) * 100)} height="10" />
          </svg>
          <span className="stats-bar__value">{nf.format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ weeks }: { weeks: number[] }) {
  const max = Math.max(...weeks, 1);
  const n = weeks.length;
  const slot = 100 / n;
  return (
    <svg className="stats-cols" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {weeks.map((v, i) => {
        const h = v > 0 ? Math.max(1, (v / max) * 40) : 0;
        return (
          <rect
            key={i}
            className="stats-cols__bar"
            x={i * slot + slot * 0.12}
            y={40 - h}
            width={slot * 0.76}
            height={h}
            style={{ animationDelay: `${i * 8}ms` }}
          />
        );
      })}
      <line className="stats-cols__base" x1="0" y1="40" x2="100" y2="40" />
    </svg>
  );
}

function summary(c: ChartSpec): { caption: string } {
  if (c.id === 'commits') {
    const peak = Math.max(...c.weeks);
    return {
      caption: `${nf.format(c.total)} commits in ${c.weeks.length} weeks. Busiest week: ${nf.format(peak)}.`,
    };
  }
  const top = c.rows[0];
  if (c.id === 'contributors') {
    return {
      caption: `${nf.format(c.total)} on ${top.label}, the most of any project.`,
    };
  }
  return {
    caption: `${nf.format(c.total)} in total. Most on ${top.label}.`,
  };
}

function Chart({ c }: { c: ChartSpec }) {
  const { caption } = summary(c);
  const hid = `stats-${c.id}`;
  return (
    <figure className="stats-chart" aria-labelledby={`${hid}-t`} data-chart={c.id}>
      <h3 className="stats-chart__title" id={`${hid}-t`}>
        {c.title}
      </h3>
      <div aria-hidden="true">
        {c.id === 'commits' ? (
          <>
            <Columns weeks={c.weeks} />
            <div className="stats-axis">
              <span>{c.weeks.length} weeks ago</span>
              <span>now</span>
            </div>
          </>
        ) : (
          <Bars rows={c.rows} />
        )}
      </div>
      <figcaption className="stats-chart__cap">{caption}</figcaption>
      <table className="sr-only">
        <caption>{c.title}</caption>
        <thead>
          <tr>
            <th scope="col">{c.id === 'commits' ? 'Week' : 'Project'}</th>
            <th scope="col">{c.id === 'commits' ? 'Commits' : c.title}</th>
          </tr>
        </thead>
        <tbody>
          {c.id === 'commits'
            ? c.weeks.map((v, i) => (
                <tr key={i}>
                  <th scope="row">{c.weeks.length - i - 1 === 0 ? 'This week' : `${c.weeks.length - i - 1} weeks ago`}</th>
                  <td>{v}</td>
                </tr>
              ))
            : c.rows.map((r) => (
                <tr key={r.slug}>
                  <th scope="row">{r.label}</th>
                  <td>{r.value}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Draws only the charts that clear their bar. Renders nothing when none do. */
export default function ProjectStats({ aggregate }: { aggregate: ProjectsAggregate }): JSX.Element | null {
  const charts = selectRespectableCharts(aggregate);
  if (charts.length === 0) return null;
  return (
    <section className="stats" aria-labelledby="stats-h">
      <h2 className="stats__h" id="stats-h">
        GitHub activity
      </h2>
      <div className="stats__grid">
        {charts.map((c) => (
          <Chart key={c.id} c={c} />
        ))}
      </div>
    </section>
  );
}
