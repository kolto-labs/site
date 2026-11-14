import { describe, expect, it } from 'vitest';

// audio.ts has no DOM access at import time; it only builds an AudioContext on demand.
const { STEP, skipMissed } = await import('../src/lib/audio');
const { BARS, BPM, H, R, STEPS_PER_BAR, songBar } = await import('../src/lib/song');

describe('skipMissed', () => {
  it('does nothing when the next step is not behind', () => {
    expect(skipMissed(1, 1, STEP)).toEqual({ steps: 0, nextTime: 1 });
    expect(skipMissed(2, 1, STEP)).toEqual({ steps: 0, nextTime: 2 });
  });

  it('skips the missed steps and lands on the first grid time at or after now', () => {
    const r = skipMissed(10, 10 + STEP * 2.5, STEP);
    expect(r.steps).toBe(3);
    expect(r.nextTime).toBeCloseTo(10 + 3 * STEP, 10);
    expect(r.nextTime).toBeGreaterThanOrEqual(10 + STEP * 2.5);
  });

  it('keeps the grid aligned for any stall length', () => {
    for (const lag of [0.0001, STEP * 0.5, STEP, STEP * 1.01, 3.3, 600]) {
      const r = skipMissed(5, 5 + lag, STEP);
      const onGrid = (r.nextTime - 5) / STEP;
      expect(onGrid).toBeCloseTo(Math.round(onGrid), 6);
      expect(r.nextTime).toBeGreaterThanOrEqual(5 + lag - 1e-9);
      expect(r.nextTime - (5 + lag)).toBeLessThan(STEP + 1e-9);
      expect(r.steps).toBe(Math.round(onGrid));
    }
  });

  it('a step is a sixteenth note of the song tempo', () => {
    expect(STEP).toBeCloseTo(60 / BPM / 4, 12);
  });
});

describe('song', () => {
  it('has 64 bars in total', () => {
    expect(BARS).toHaveLength(64);
  });

  it('sections sum to 64 bars in the order intro, A, B, breakdown, A-prime', () => {
    const counts = new Map<string, number>();
    for (const b of BARS) counts.set(b.section.name, (counts.get(b.section.name) ?? 0) + 1);
    expect([...counts]).toEqual([
      ['intro', 8],
      ['A', 16],
      ['B', 16],
      ['breakdown', 8],
      ["A'", 16],
    ]);
  });

  it('every section has one lead slot per chord', () => {
    const seen = new Set<unknown>();
    for (const { section } of BARS) {
      if (seen.has(section)) continue;
      seen.add(section);
      expect(section.lead, section.name).toHaveLength(section.chords.length);
    }
  });

  it('every lead bar is 16 steps of a note, a hold or a rest', () => {
    for (const b of BARS) {
      if (b.lead === null) continue;
      expect(b.lead).toHaveLength(STEPS_PER_BAR);
      for (const n of b.lead) expect(n === H || n === R || (n >= 36 && n <= 100)).toBe(true);
    }
  });

  it('bars are numbered from 0 inside their section', () => {
    let prev: unknown;
    let n = -1;
    for (const b of BARS) {
      n = b.section === prev ? n + 1 : 0;
      prev = b.section;
      expect(b.bar).toBe(n);
    }
  });

  it('every chord has a pad voicing, a bass note and an arp cycle', () => {
    for (const b of BARS) {
      expect(b.chord.notes.length).toBeGreaterThanOrEqual(3);
      expect(b.chord.bass).toBeLessThan(b.chord.notes[0]);
      expect(b.chord.arp).toHaveLength(b.chord.notes.length + 1);
    }
  });

  describe('songBar', () => {
    const intro = BARS.filter((b) => b.section.name === 'intro').length;
    const loop = BARS.length - intro;

    it('is the identity through the first pass', () => {
      for (let n = 0; n < BARS.length; n++) expect(songBar(n)).toBe(n);
    });

    it('wraps to the restart bar (the first bar after the intro), not to bar 0', () => {
      expect(songBar(BARS.length)).toBe(intro);
      expect(BARS[songBar(BARS.length)].section.name).toBe('A');
      expect(songBar(BARS.length + loop - 1)).toBe(BARS.length - 1);
      expect(songBar(BARS.length + loop)).toBe(intro);
    });

    it('never leaves the order list and never replays the intro', () => {
      for (let n = 0; n < BARS.length * 5; n++) {
        const i = songBar(n);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(BARS.length);
        if (n >= BARS.length) expect(i).toBeGreaterThanOrEqual(intro);
      }
    });
  });
});

