import type { RepoData } from './repos';
export const API: string;
export const RAW: string;
export interface ApiResult {
  status: number;
  json: any;
  link: string | null;
}
export type ApiFn = (url: string) => Promise<ApiResult>;
export type RawFn = (url: string) => Promise<string | null>;
export function listOrgRepos(api: ApiFn): Promise<any[]>;
export function gitSegment(url: string): string;
export function parseCargo(text: string): { name: string | null; members: string[]; bin: boolean; autobins: boolean; deps: { key: string; git?: string; pkg?: string; path?: string }[] };
export function cargoDepNames(parsed: ReturnType<typeof parseCargo>): string[];
export function parsePackageJson(text: string): { name: string | null; names: string[] };
export function parseFeatures(md: string): string[];
export function summariseReleases(list: unknown): { release: RepoData['release']; downloads: number };
export interface Manifests {
  crates: { name: string; bin: boolean }[];
  refs: string[];
  pkgName: string | null;
  cargoOk: boolean;
  pkgOk: boolean;
  failed: number;
}
export function readCargo(raw: RawFn, base: string): Promise<{ crates: { name: string; bin: boolean }[]; refs: string[]; failed: number }>;
export function readManifests(raw: RawFn, name: string, branch: string): Promise<Manifests>;
/** `stats: true` adds contributors and weekly commits. `failed` counts requests that did not answer; `pending` counts stats endpoints still being computed (202/204). */
export function collectRepos(opts: { api: ApiFn; raw: RawFn; prev?: RepoData[]; stats?: boolean }): Promise<{ repos: RepoData[]; failed: number; pending: number }>;
