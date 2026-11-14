import { whenEngine as engine } from '../../engine';

/** Mounts the city crop on the canvas. Returns a disposer. */
export async function start(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<() => void> {
  const { motion } = await engine();
  const api = await motion();
  const placement = await api.mount(canvas, { id: 'pl1-credits', crop: 'city', signal });
  return () => placement.dispose();
}
