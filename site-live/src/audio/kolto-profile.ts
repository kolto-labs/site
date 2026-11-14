import type { Route, ScoreProfile } from '@kolto/adaptive-music';
import type { PageKey } from '../routes';

const OFF = -60;

const ROUTES: Readonly<Record<PageKey, Route>> = {
  Home: { gain: {}, grav: [1, 4, 7], rate: 1, dens: 1, reg: 0 },
  About: { gain: { pad: 3, hats: -6, kick: -6 }, grav: [3, 4, 1], rate: 1, dens: 0.7, reg: 2 },
  Projects: { gain: { arp: 3, cuep: 3 }, grav: [1, 5, 6], rate: 1, dens: 0.9, reg: 0 },
  Roadmap: { gain: { pad: 2 }, grav: [1, 6, 7], rate: 2, dens: 0.6, reg: -2, half: true },
  Faq: { gain: { arp: -4, kick: OFF }, grav: [4, 1], rate: 1, dens: 0.5, reg: 3, hatsOnly: true },
  Join: { gain: { pad: 3, hats: -6, kick: -6, arp: 2 }, grav: [3, 7], rate: 1, dens: 0.8, reg: 2 },
  Credits: { gain: { pad: 3, kick: OFF }, grav: [1, 4], rate: 2, dens: 0.5, reg: 5, bell: true },
  Play: { gain: { pad: 3, hats: -6, kick: -6 }, grav: [3, 4, 1], rate: 1, dens: 0.7, reg: 2 },
  NotFound: {
    gain: { pad: -9, arp: OFF, bass: OFF, hats: OFF, kick: OFF, melody: OFF },
    grav: [7, 4], rate: 2, dens: 0, reg: -3, sparse: true, noCad: true, droneDb: 3,
  },
};

export const KOLTO_PROFILE: ScoreProfile = {
  name: 'kolto',
  scales: [
    [0, 2, 3, 5, 7, 9, 10],
    [0, 1, 3, 5, 7, 8, 10],
    [0, 2, 4, 5, 7, 9, 10],
    [0, 2, 3, 5, 7, 8, 10],
  ],
  states: {
    R0: { mode: 0, bpm: 116 },
    R1: { mode: 1, bpm: 112, meters: [16, 14, 16, 14], drift: { sd: 7, tau: 20 }, jitter: true, row: [1, 0, 0.4] },
    R2: { mode: 2, bpm: 104, noSaw: true, padMul: 1.23, seventh: true },
    R3: {
      mode: 3, bpm: 98, thin: true, drift: { sd: 12, tau: 30 }, penult: [0, 1, 2, 4, 5], row: [4, 0, 0], melKind: 1, lpCap: 900,
    },
    T1: { mode: 0, bpm: 116 },
    T2: { mode: 0, bpm: 116 },
    T3: { mode: 0, bpm: 116 },
  },
  initial: 'R0',
  routes: ROUTES,
  home: 'Home',
  rhythms: [[2, 2, 2, 2], [3, 1, 2, 2], [2, 1, 1, 4], [1, 1, 2, 4], [3, 1, 1, 3], [2, 2, 1, 3]],
  motifs: {
    panel: { ps: [0, 2, 4, 7, 5, 4], ss: [0, 2, 4, 6, 10, 14], len: 3, lens: { 3: 4 } },
    security: { ps: [2, 1, 0], ss: [0, 3, 6], len: 3 },
    court: {
      ps: [0, 1, 2, 4, 5], ss: [0, 4, 8, 12, 16], len: 4, centre: 72,
      late: { states: ['T1', 'T2', 'T3'], mark: 'verdict', at: 4, ps: [2, 4, 0] },
    },
    ancient: { ps: [3, 4], ss: [0, 8], len: 10 },
    permit: { ps: [1, 0], ss: [0, 4], len: 6, signed: true },
    rep: { ps: [0, -2, -1, 0], rhythm: true },
    sith: { ps: [0, -3, -2, -1], rhythm: true },
    dock: { chord: [60, 67] },
    swim: { dna: 0 },
    detuned: { dna: 1 },
    minor: { dna: 2, take: 3 },
  },
};
