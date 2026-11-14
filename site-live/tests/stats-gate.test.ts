import { describe, expect, it } from 'vitest';
import { STAT_THRESHOLDS } from '../src/content/project-contract';
import { selectRespectableCharts } from '../src/content/stats-gate';
import { snapshotAggregate } from '../src/content/repos';
import { agg, proj } from './helpers';

const ids = (a: Parameters<typeof selectRespectableCharts>[0]) => selectRespectableCharts(a).map((c) => c.id);
const one = (stats: NonNullable<Parameters<typeof proj>[1]>['stats'], fork?: boolean) => agg([proj('p', { stats, fork })]);

describe('selectRespectableCharts thresholds', () => {
  it('stars: at the bar passes, one below fails', () => {
    expect(ids(one({ stars: STAT_THRESHOLDS.totalStars }))).toEqual(['stars']);
    expect(ids(one({ stars: STAT_THRESHOLDS.totalStars - 1 }))).toEqual([]);
  });

  it('stars are summed across projects', () => {
    expect(ids(agg([proj('a', { stats: { stars: 25 } }), proj('b', { stats: { stars: 25 } })]))).toEqual(['stars']);
  });

  it('downloads: at the bar passes, one below fails', () => {
    expect(ids(one({ downloads: STAT_THRESHOLDS.totalDownloads }))).toEqual(['downloads']);
    expect(ids(one({ downloads: STAT_THRESHOLDS.totalDownloads - 1 }))).toEqual([]);
  });

  it('commits: at the bar passes, one below fails', () => {
    const c = selectRespectableCharts(one({ weeklyCommits: [STAT_THRESHOLDS.commitsLastYear] }));
    expect(c.map((x) => x.id)).toEqual(['commits']);
    expect(ids(one({ weeklyCommits: [STAT_THRESHOLDS.commitsLastYear - 1] }))).toEqual([]);
  });

  it('contributors: at the bar passes, one below fails', () => {
    expect(ids(one({ contributors: STAT_THRESHOLDS.contributors }))).toEqual(['contributors']);
    expect(ids(one({ contributors: STAT_THRESHOLDS.contributors - 1 }))).toEqual([]);
  });

  it('contributors gate on the max, not the sum', () => {
    const four = [1, 2, 3].map((i) => proj(`p${i}`, { stats: { contributors: STAT_THRESHOLDS.contributors - 1 } }));
    expect(ids(agg(four))).toEqual([]); // sum is 12, max is 4
    const out = selectRespectableCharts(agg([...four, proj('big', { stats: { contributors: 5 } })]));
    const c = out.find((x) => x.id === 'contributors')!;
    expect(c.total).toBe(5);
  });

  it('returns charts in a stable order with sorted bars', () => {
    const out = selectRespectableCharts(
      agg([
        proj('a', { stats: { stars: 30, downloads: 100, contributors: 6, weeklyCommits: [400] } }),
        proj('b', { stats: { stars: 40, downloads: 900, contributors: 9 } }),
      ]),
    );
    expect(out.map((c) => c.id)).toEqual(['commits', 'downloads', 'stars', 'contributors']);
    const stars = out.find((c) => c.id === 'stars');
    expect(stars && 'rows' in stars && stars.rows.map((r) => r.slug)).toEqual(['b', 'a']);
  });
});

describe('selectRespectableCharts input handling', () => {
  it('excludes forks from every chart', () => {
    const f = one({ stars: 9999, downloads: 9999, contributors: 99, weeklyCommits: [9999] }, true);
    expect(selectRespectableCharts(f)).toEqual([]);
  });

  it('keeps non-fork projects when a fork sits beside them', () => {
    const a = agg([proj('fork', { fork: true, stats: { stars: 1000 } }), proj('own', { fork: false, stats: { stars: 50 } })]);
    const stars = selectRespectableCharts(a)[0];
    expect(stars.total).toBe(50);
  });

  it('treats null, NaN and missing values as 0', () => {
    const bad = agg([
      proj('a', { stats: { stars: null as unknown as number, downloads: NaN, contributors: NaN, weeklyCommits: [NaN, null as unknown as number] } }),
      proj('b', { stats: null }),
    ]);
    expect(selectRespectableCharts(bad)).toEqual([]);
    // and a NaN beside a good value does not poison the sum
    const mixed = agg([proj('a', { stats: { stars: NaN } }), proj('b', { stats: { stars: 50 } })]);
    expect(selectRespectableCharts(mixed)[0].total).toBe(50);
  });

  it('returns [] for null, undefined and a malformed aggregate', () => {
    expect(selectRespectableCharts(null)).toEqual([]);
    expect(selectRespectableCharts(undefined)).toEqual([]);
    expect(selectRespectableCharts({ listed: null } as never)).toEqual([]);
  });

  it('aligns unequal week series to now', () => {
    const out = selectRespectableCharts(
      agg([proj('long', { stats: { weeklyCommits: [100, 0, 0, 0, 0] } }), proj('short', { stats: { weeklyCommits: [100, 100, 100] } })]),
    );
    const c = out[0];
    expect(c.id).toBe('commits');
    expect('weeks' in c && c.weeks).toEqual([100, 0, 100, 100, 100]);
    expect(c.total).toBe(400);
  });

  it('caps the commit series at 52 weeks, keeping the newest', () => {
    const w = Array.from({ length: 60 }, (_, i) => (i < 8 ? 1000 : 10));
    const c = selectRespectableCharts(one({ weeklyCommits: w }))[0];
    expect('weeks' in c && c.weeks).toHaveLength(52);
    expect('weeks' in c && c.weeks.every((v) => v === 10)).toBe(true);
    expect(c.total).toBe(520);
  });

  it('ignores empty series', () => {
    expect(ids(one({ weeklyCommits: [] }))).toEqual([]);
  });

  it('the real snapshot shows no charts yet', () => {
    expect(selectRespectableCharts(snapshotAggregate)).toEqual([]);
  });
});
