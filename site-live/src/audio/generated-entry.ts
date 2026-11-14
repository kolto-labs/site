import { create as createGenerated, kind } from '@kolto/adaptive-music/generated';
import type { SourceHost } from '@kolto/adaptive-music';
import { KOLTO_PROFILE } from './kolto-profile';

export { CUES } from './kolto-cues';
export { kind };

export function create(host: SourceHost) {
  return createGenerated({ ...host, profile: KOLTO_PROFILE });
}
