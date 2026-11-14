import type { PageKey } from '../../routes';

export type Unsubscribe = () => void;
export type WorldStateId = 'R0' | 'R1' | 'R2' | 'R3' | 'T1' | 'T2' | 'T3';
export type Tier = 'ambient' | 'common' | 'uncommon' | 'rare' | 'veryRare' | 'oneShot' | 'rider';

/** Exactly the 46 events of SUPPLY-CHAIN.md §3.4–3.5. */
export type EventId =
  | 'V1' | 'V1x' | 'F1' | 'A1' | 'A2' | 'A3'
  | 'V2' | 'A4' | 'A5' | 'A6' | 'D1' | 'D2' | 'F2' | 'A7' | 'S1' | 'S2' | 'S3' | 'D3' | 'F3' | 'C1' | 'D4'
  | 'V3' | 'F4' | 'S4' | 'A8' | 'D5' | 'C2' | 'F5' | 'S5'
  | 'R1-a' | 'R1-b' | 'R1-c' | 'R1-d' | 'R1-e' | 'R1-f' | 'R1-g'
  | 'R2-a' | 'R2-b' | 'R2-c' | 'R2-d'
  | 'R3-a' | 'R3-b' | 'R3-c' | 'R3-d' | 'R3-e'
  | 'T1-a';

/** SUPPLY-CHAIN §3.2 vocabulary, plus names for its free-text cues. */
export type CueId =
  | 'bed.vent' | 'bed.city'
  | 'pulse.harvest' | 'pulse.pack' | 'pulse.load' | 'pulse.station'
  | 'motif.rep' | 'motif.sith' | 'motif.permit' | 'motif.dock' | 'motif.panel' | 'motif.security'
  | 'motif.court' | 'motif.ancient' | 'motif.swim'
  | 'swell.firaxa' | 'swell.giant' | 'swell.descent'
  | 'fx.tick' | 'fx.rise' | 'fx.swoosh' | 'fx.ping' | 'fx.scream' | 'fx.boom'
  | 'state.R0' | 'state.R1' | 'state.R2' | 'state.R3' | 'state.T1'
  // free-text cues in SUPPLY-CHAIN, named here:
  | 'texture.school'      // F1 "texture only"
  | 'perc.skitter'        // F3 "percussive skitter"
  | 'harm.heldDissonance' // C1 "held dissonance that resolves when security arrives"
  | 'perc.hatFlurry'      // D4 "fast hi-hat flurry"
  | 'xform.quicken'       // F4 "layers quicken"
  | 'xform.doubleTime'    // R1-c "layers at double time"
  | 'xform.dropout'       // R1-d "layer dropouts"
  | 'xform.cutLayer'      // R1-g "one layer cuts to silence"
  | 'motif.detuned'       // R1-f "detuned motif"
  | 'motif.minor';        // R3-e "minor motif"; R1-e is motif.panel with {mode:'minor'}

export type { PageKey };
