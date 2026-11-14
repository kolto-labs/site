import { whenEngine as engine } from '../../engine';

export async function mountWindow(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<() => void> {
  const { motion } = await engine();
  const api = await motion();
  if (signal.aborted) return () => {};
  const placement = await api.mount(canvas, { id: 'pl1-notfound', crop: 'rift', signal });
  if (signal.aborted) {
    placement.dispose();
    return () => {};
  }
  return () => placement.dispose();
}
