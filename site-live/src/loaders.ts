import type { ComponentType } from 'react';
import type { PageKey } from './routes';

/** Code-split loaders for the browser. The server imports pages eagerly. */
export const loaders: Record<PageKey, () => Promise<{ default: ComponentType }>> = {
  Home: () => import('./pages/Home'),
  About: () => import('./pages/About'),
  Projects: () => import('./pages/Projects'),
  Roadmap: () => import('./pages/Roadmap'),
  Faq: () => import('./pages/Faq'),
  Join: () => import('./pages/Join'),
  Credits: () => import('./pages/Credits'),
  Play: () => import('./pages/Play'),
  NotFound: () => import('./pages/NotFound'),
};
