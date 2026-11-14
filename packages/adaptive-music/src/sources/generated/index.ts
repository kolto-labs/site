import type { GeneratedSource, SourceHost } from '../../index';
import { createSource } from './source';

export const kind = 'generated' as const;

export async function create(h: SourceHost): Promise<GeneratedSource> {
  const profile = h.profile ?? (await import('./default-profile')).DEFAULT_PROFILE;
  return createSource({ ...h, profile });
}
