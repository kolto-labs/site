/**
 * Song data for audio.ts: "Kolto Pressure", an original keygen-style tracker
 * tune. G minor verses, a B-flat major lift, a breakdown, then the verse again.
 * Pure data, no DOM access, so it stays in the lazily loaded audio chunk.
 */

export const BPM = 132;
export const STEPS_PER_BAR = 16;

interface Chord {
  /** pad voicing, kept inside one octave for smooth voice leading */
  notes: readonly number[];
  bass: number;
  /** arpeggio cycle: the voicing an octave up plus the root two octaves up */
  arp: readonly number[];
}
const chord = (notes: number[], bass: number): Chord => ({ notes, bass, arp: [...notes.map((n) => n + 12), notes[0] + 24] });

const CHORDS = {
  Gm: chord([55, 58, 62], 43),
  Cm: chord([55, 60, 63], 36),
  D: chord([54, 57, 62], 38),
  Eb: chord([55, 58, 63], 39),
  F: chord([57, 60, 65], 41),
  Bb: chord([58, 62, 65], 46),
};
type ChordName = keyof typeof CHORDS;

/** One bar of lead, 16 sixteenths. A MIDI note starts a note, H holds, R rests. */
type Pattern = readonly number[];
export const H = 0;
export const R = -1;

interface Parts {
  kick?: 'half' | 'four';
  snare?: boolean;
  /** 1 = offbeat open hats, 2 = offbeat hats plus quiet 16th ticks */
  hats?: 0 | 1 | 2;
  bass?: boolean;
  arp?: boolean;
  pad?: boolean;
  /** snare roll that builds through the bar */
  roll?: boolean;
  /** snare fill on the last beat */
  fill?: boolean;
  /** double the lead an octave down */
  dbl?: boolean;
}

interface Section {
  name: string;
  chords: ChordName[];
  lead: (Pattern | null)[];
  parts: (bar: number) => Parts;
  /** arp filter sweep: from Hz, to Hz, period in bars, ramp shape */
  sweep: [number, number, number, 'up' | 'tri'];
}

const chords = (s: string) => s.split(' ') as ChordName[];

const INTRO: Section = {
  name: 'intro',
  chords: chords('Gm Gm Eb F Gm Gm Cm D'),
  lead: [
    null,
    null,
    null,
    null,
    [67, H, H, H, H, H, H, H, 74, H, H, H, H, H, H, H],
    [H, H, H, H, H, H, H, H, 75, H, H, H, 74, H, H, H],
    [72, H, H, H, H, H, 75, H, H, H, 79, H, H, H, H, H],
    [78, H, H, H, H, H, H, H, H, H, H, H, R, H, H, H],
  ],
  parts: (b) => ({
    arp: true,
    pad: true,
    kick: b >= 4 ? 'four' : b >= 2 ? 'half' : undefined,
    bass: b >= 4,
    hats: b >= 6 ? 1 : 0,
    roll: b === 7,
  }),
  sweep: [260, 4200, 8, 'up'],
};

const A_LEAD: Pattern[] = [
  [67, H, H, 74, H, H, 75, H, 74, H, H, 70, H, 72, H, H],
  [74, H, H, H, H, H, 70, H, H, H, 67, H, R, H, 70, 72],
  [75, H, H, 74, H, H, 70, H, 67, H, H, 70, H, 75, H, H],
  [77, H, H, H, H, H, 75, H, 74, H, H, 72, H, H, 69, H],
  [67, H, H, 74, H, H, 75, H, 77, H, H, 79, H, 82, H, H],
  [H, H, H, H, H, H, H, H, 81, H, H, 79, H, 77, H, H],
  [84, H, H, 82, H, H, 79, H, 75, H, H, 79, H, 84, H, H],
  [81, H, H, H, H, H, 78, H, H, H, 74, H, H, H, R, H],
  [75, H, H, 79, H, H, 82, H, H, H, 79, H, H, H, 75, H],
  [77, H, H, 81, H, H, 84, H, H, H, 81, H, 77, H, H, H],
  [79, H, H, 82, H, H, 86, H, H, H, 84, H, 82, H, 81, H],
  [79, H, H, H, H, H, H, H, R, H, H, H, 74, H, 77, H],
  [79, H, H, 75, H, H, 72, H, 84, H, H, 82, H, 79, H, H],
  [75, H, H, 74, H, H, 72, H, H, H, 70, H, 72, H, H, H],
  [74, H, H, H, H, H, H, H, 78, H, H, H, 81, H, H, H],
];

const A: Section = {
  name: 'A',
  chords: chords('Gm Gm Eb F Gm Gm Cm D Eb F Gm Gm Cm Cm D F'),
  // last bar: a rising F-A-C fanfare that hands over to B-flat major
  lead: [...A_LEAD, [72, H, H, 77, H, H, 81, H, 84, H, H, H, H, H, H, H]],
  parts: (b) => ({ arp: true, bass: true, kick: 'four', snare: true, hats: 1, fill: b % 8 === 7 }),
  sweep: [700, 3600, 4, 'tri'],
};

const B_HEAD: Pattern[] = [
  [74, H, 77, H, 82, H, H, H, H, H, H, H, 84, H, H, H],
  [81, H, H, H, H, H, 77, H, 72, H, H, H, 77, H, 81, H],
  [79, H, H, H, H, H, 74, H, H, H, 82, H, 81, H, 79, H],
];

const B: Section = {
  name: 'B',
  chords: chords('Bb F Gm Eb Bb F Eb F Bb F Gm Eb Cm Cm Eb F'),
  lead: [
    ...B_HEAD,
    [H, H, H, H, H, H, H, H, 75, H, H, H, R, H, 77, 79],
    [82, H, H, H, 77, H, 82, H, 86, H, H, H, 84, H, 82, H],
    [81, H, H, 84, H, H, 81, H, 77, H, H, H, 72, H, 77, H],
    [79, H, H, 82, H, H, H, H, 79, H, 77, H, 75, H, H, H],
    [77, H, H, H, H, H, H, H, H, H, H, H, 72, H, 74, H],
    ...B_HEAD,
    [79, H, H, H, 75, H, H, H, 82, H, H, H, 79, H, H, H],
    [84, H, H, H, H, H, 79, H, 75, H, H, 79, H, 84, H, H],
    [86, H, H, 84, H, H, 82, H, H, H, 79, H, H, H, H, H],
    [82, H, H, H, H, H, 79, H, H, H, 75, H, H, H, 79, H],
    [81, H, H, H, H, H, H, H, R, H, H, H, H, H, H, H],
  ],
  parts: (b) => ({ arp: true, bass: true, pad: true, kick: 'four', snare: true, hats: 2, fill: b % 8 === 7 }),
  sweep: [1200, 5200, 8, 'tri'],
};

const BREAK: Section = {
  name: 'breakdown',
  chords: chords('Gm Eb Cm D Gm Eb Cm D'),
  lead: [
    [79, H, H, H, H, H, H, H, 74, H, H, H, H, H, H, H],
    [75, H, H, H, H, H, H, H, 79, H, H, H, H, H, H, H],
    [72, H, H, H, H, H, 75, H, H, H, 79, H, H, H, H, H],
    [78, H, H, H, H, H, H, H, R, H, H, H, H, H, H, H],
    [79, H, H, H, H, H, H, H, 74, H, H, H, H, H, H, H],
    [75, H, H, H, H, H, H, H, 79, H, H, H, 82, H, H, H],
    null,
    null,
  ],
  parts: (b) => ({
    arp: true,
    pad: true,
    bass: b >= 4,
    kick: b >= 6 ? 'four' : b >= 4 ? 'half' : undefined,
    hats: b >= 6 ? 1 : 0,
    roll: b >= 6,
  }),
  sweep: [240, 4400, 8, 'up'],
};

const A2: Section = {
  ...A,
  name: "A'",
  chords: chords('Gm Gm Eb F Gm Gm Cm D Eb F Gm Gm Cm Cm D D'),
  // last bar: a falling D-C-A-F# turnaround that resolves into the loop
  lead: [...A_LEAD, [86, H, H, H, 84, H, H, H, 81, H, H, H, 78, H, H, H]],
  parts: (b) => ({ arp: true, bass: true, pad: b >= 8, kick: 'four', snare: true, hats: 2, dbl: true, fill: b % 8 === 7 }),
};

/** Order list. After the last bar the song restarts at RESTART_BAR (the A section). */
const ORDER: Section[] = [INTRO, A, B, BREAK, A2];

export interface Bar {
  section: Section;
  bar: number;
  chord: Chord;
  lead: Pattern | null;
  parts: Parts;
}

export const BARS: Bar[] = ORDER.flatMap((section) =>
  section.chords.map((name, bar) => ({
    section,
    bar,
    chord: CHORDS[name],
    lead: section.lead[bar] ?? null,
    parts: section.parts(bar),
  })),
);

const RESTART_BAR = INTRO.chords.length;

/** Map an ever-increasing bar counter onto the order list, honouring the restart point. */
export function songBar(n: number): number {
  if (n < BARS.length) return n;
  const loop = BARS.length - RESTART_BAR;
  return RESTART_BAR + ((n - BARS.length) % loop);
}
