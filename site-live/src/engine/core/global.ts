/** The singleton store: `globalThis.__koltoEngine[ENGINE_VERSION][name]`. Only touched when called. */
export const ENGINE_VERSION = 1;

type Store = Record<number, Record<string, unknown>>;

declare global {
  var __koltoEngine: Store | undefined;
}

function bucket(): Record<string, unknown> {
  const root = (globalThis.__koltoEngine ??= {});
  return (root[ENGINE_VERSION] ??= {});
}

/** Returns the instance stored under `name`, creating it once. Survives HMR re-imports. */
export function slot<T>(name: string, make: () => T): T {
  const b = bucket();
  if (!(name in b)) b[name] = make();
  return b[name] as T;
}

export function dropSlot(name: string): void {
  const b = globalThis.__koltoEngine?.[ENGINE_VERSION];
  if (b) delete b[name];
}
