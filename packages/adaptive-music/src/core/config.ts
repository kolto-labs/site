export interface AdaptiveMusicConfig {
  tempo: 'range' | 'follow';
  visits: 'off' | 'local';
  treatment: 'light' | 'none';
  uiSounds: boolean;
  level: number;
  limits: { maxFiles: number; maxBytes: number; maxSeconds: number };
}

export const DEFAULT_CONFIG: AdaptiveMusicConfig = {
  tempo: 'range',
  visits: 'off',
  treatment: 'light',
  uiSounds: true,
  level: 0.3,
  limits: { maxFiles: 30, maxBytes: 500 * 1048576, maxSeconds: 720 },
};

export function mergeConfig(base: AdaptiveMusicConfig, patch?: Partial<AdaptiveMusicConfig>): AdaptiveMusicConfig {
  return { ...base, ...patch, limits: { ...base.limits, ...patch?.limits } };
}

/** The band the brief sets for Generated with `tempo: 'range'` (W13). `'follow'` allows the ±4% swing outside it. */
export const BPM_RANGE = [98, 116] as const;
