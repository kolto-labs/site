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
  limits: { maxFiles: 8, maxBytes: 50 * 1048576, maxSeconds: 900 },
};

export function mergeConfig(base: AdaptiveMusicConfig, patch?: Partial<AdaptiveMusicConfig>): AdaptiveMusicConfig {
  return { ...base, ...patch, limits: { ...base.limits, ...patch?.limits } };
}
