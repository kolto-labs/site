export type ErrorCode =
  | 'unsupported' | 'needs-gesture' | 'context-failed' | 'chunk-failed' | 'disposed'
  | 'unknown-source' | 'no-media'
  | 'decode-failed' | 'unsupported-type' | 'too-large' | 'too-long'
  | 'storage-full' | 'storage-unavailable' | 'analysis-failed';

export class AdaptiveMusicError extends Error {
  readonly code: ErrorCode;
  override readonly cause?: unknown;
  constructor(code: ErrorCode, message?: string, cause?: unknown) {
    super(message ?? code);
    this.name = 'AdaptiveMusicError';
    this.code = code;
    this.cause = cause;
  }
}
