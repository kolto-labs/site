export interface Rec {
  n: number;
  t: number;
  dur: number;
  step: number;
  meter: number;
  bpm: number;
  st: number;
  tones: number[];
  root: number;
  pcs: number[];
}

export interface BarOf<E> extends Rec {
  evs: E[];
}

export interface Sink<B, E> {
  bar(b: B): void;
  play(e: E): void;
}

interface Job {
  at: number;
  fn: (at: number) => void;
  owner: number;
}

export class Transport<B extends BarOf<E>, E> {
  n = 0;
  next = 0;
  skipped = 0;
  bars: Rec[] = [];
  jobs: Job[] = [];
  lastDur = 2;

  constructor(
    private now: () => number,
    private plan: (n: number, t: number) => B,
    private sink: Sink<B, E>,
    private tick?: (to: number) => void,
  ) {}

  start(t: number): void {
    this.next = t;
  }

  horizon(): number {
    return this.lastDur + 0.25;
  }

  at(t: number, fn: (at: number) => void, owner = 0): void {
    if (t < this.now() + this.horizon()) fn(t);
    else this.jobs.push({ at: t, fn, owner });
  }

  cancel(owner: number): void {
    this.jobs = this.jobs.filter((j) => j.owner !== owner);
  }

  wake(): void {
    const now = this.now();
    let guard = 0;
    while (this.next < now + 0.05) {
      if (guard++ > 48) {
        this.n += Math.ceil((now + 0.1 - this.next) / this.lastDur);
        this.next = now + 0.1;
        this.skipped++;
        break;
      }
      const b = this.plan(this.n, this.next);
      this.lastDur = b.dur;
      this.note(b);
      this.n++;
      this.next += b.dur;
      this.skipped++;
    }
    while (this.next < now + this.horizon()) {
      const b = this.plan(this.n, this.next);
      this.lastDur = b.dur;
      this.note(b);
      this.sink.bar(b);
      for (const e of b.evs) this.sink.play(e);
      this.n++;
      this.next += b.dur;
    }
    this.tick?.(now + this.horizon());
    if (this.jobs.length) {
      const h = now + this.horizon();
      const due = this.jobs.filter((j) => j.at < h);
      if (due.length) {
        this.jobs = this.jobs.filter((j) => j.at >= h);
        for (const j of due) j.fn(j.at);
      }
    }
  }

  private note(b: B): void {
    this.bars.push({ n: b.n, t: b.t, dur: b.dur, step: b.step, meter: b.meter, bpm: b.bpm, st: b.st, tones: b.tones, root: b.root, pcs: b.pcs });
    if (this.bars.length > 48) this.bars.shift();
  }

  barAt(t: number): Rec | null {
    const bs = this.bars;
    if (bs.length === 0) return null;
    for (let i = bs.length - 1; i >= 0; i--) {
      if (t >= bs[i].t) {
        const b = bs[i];
        if (t < b.t + b.dur || i < bs.length - 1) return b;
        const k = Math.floor((t - b.t) / b.dur);
        return { ...b, n: b.n + k, t: b.t + k * b.dur };
      }
    }
    return bs[0];
  }

  downbeatAtOrAfter(t: number): number {
    const b = this.barAt(t);
    if (!b) return t;
    return t - b.t < 1e-4 ? b.t : b.t + b.dur;
  }

  beatAtOrAfter(t: number): number {
    const b = this.barAt(t);
    if (!b) return t;
    const beat = b.step * 4;
    const k = Math.ceil((t - b.t) / beat - 1e-4);
    const x = b.t + k * beat;
    return x > b.t + b.dur - 1e-6 ? b.t + b.dur : x;
  }
}
