import type { ScoreProfile } from './profile';

export const DEFAULT_PROFILE: ScoreProfile = {
  scales: [[0, 2, 3, 5, 7, 8, 10]],
  states: { main: { mode: 0, bpm: 108 } },
  initial: 'main',
  routes: { home: { gain: {}, grav: [1, 4, 7], rate: 1, dens: 1, reg: 0 } },
  home: 'home',
  rhythms: [[2, 2, 2, 2]],
  motifs: {},
};
