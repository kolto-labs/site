import type { InputEvent, SignalInput, SignalSnapshot } from '../index';
import { Emitter } from './events';

export function createInput() {
  let fn: (() => SignalSnapshot) | null = null;
  const ev = new Emitter<InputEvent>();
  const api: SignalInput = {
    provide(f) {
      fn = f;
    },
    event(e) {
      ev.emit(e);
    },
  };
  return { api, snap: (): SignalSnapshot => (fn ? fn() : {}), on: (f: (e: InputEvent) => void) => ev.on(f), clear: () => ev.clear() };
}
