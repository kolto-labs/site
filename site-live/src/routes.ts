import type { ComponentType } from 'react';
import { normalizePath } from './lib/seo';
import { PAGES } from './flags';

export type PageKey = 'Home' | 'About' | 'Projects' | 'Roadmap' | 'Faq' | 'Join' | 'Credits' | 'Play' | 'NotFound';
export type PageMap = Record<PageKey, ComponentType>;

export const PATHS: Record<Exclude<PageKey, 'NotFound'>, string> = {
  Home: '/',
  About: '/about',
  Projects: '/projects',
  Roadmap: '/roadmap',
  Faq: '/faq',
  Join: '/join',
  Credits: '/credits',
  Play: '/play',
};

export function pageKeyFor(pathname: string): PageKey {
  const p = normalizePath(pathname);
  const hit = (Object.keys(PATHS) as (keyof typeof PATHS)[]).find((k) => PATHS[k] === p && (k !== 'Join' || PAGES.join));
  return hit ?? 'NotFound';
}
