import type { ProjectView } from '../content/repos';
import { content, SITE_URL } from '../content';
import { plain } from './seo';

const W = 76;

export const statusLabel = (s: ProjectView['status']) =>
  s === 'released' ? 'Released' : s === 'in-development' ? 'In development' : s === 'planned' ? 'Planned' : 'Public';

function center(s: string, w = W) {
  const len = [...s].length;
  const left = Math.max(0, Math.floor((w - len) / 2));
  return ' '.repeat(left) + s;
}

export function wrap(text: string, width = W - 4, indent = '  '): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > width) {
      out.push(indent + line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(indent + line);
  return out;
}

export function sectionRule(label: string, w = W) {
  const tag = `[ ${label.toUpperCase()} ]`;
  const left = Math.floor((w - 4 - tag.length) / 2);
  const right = w - 4 - tag.length - left;
  return `  ${'─'.repeat(left)}${tag}${'─'.repeat(right)}`;
}

const leader = (key: string, val: string, keyW = 15) => `${key} ${'.'.repeat(Math.max(2, keyW - key.length))}: ${val}`;

function spaced(s: string) {
  return [...s.toUpperCase()].join(' ');
}

export function projectNfo(p: ProjectView): string {
  const L: string[] = [];
  L.push('');
  L.push(center('░▒▓█  K O L T O   L A B S   P R E S E N T S  █▓▒░'));
  L.push('');
  L.push(center(spaced(p.name) + (p.version ? `   v${p.version}` : '')));
  L.push('');
  for (const l of wrap(p.tagline || p.name, 60, '')) L.push(center(l));
  L.push('');
  L.push(sectionRule('Release info'));
  L.push('');
  const pairs: [string, string][] = [
    ['Release', p.name],
    ['Version', p.version ?? 'unreleased'],
    ['Status', statusLabel(p.status)],
    ['Language', p.lang],
    ['License', p.license],
    ['Supplied by', 'the community'],
  ];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = leader(pairs[i][0], pairs[i][1]);
    const b = pairs[i + 1] ? leader(pairs[i + 1][0], pairs[i + 1][1], 12) : '';
    L.push(`  ${a.padEnd(38)}${b}`);
  }
  if (p.repo) L.push(`  ${leader('Protection', "None. It's open source.")}`);
  L.push(`  ${leader('Repository', p.repo ? p.repo.replace(/^https?:\/\//, '') : 'not public yet')}`);
  const notes = p.description || (p.repo ? 'No description on GitHub yet.' : '');
  if (notes) {
    L.push('');
    L.push(sectionRule('Notes'));
    L.push('');
    L.push(...wrap(plain(notes)));
  }
  if (p.features.length) {
    L.push('');
    L.push(sectionRule('Features'));
    L.push('');
    for (const f of p.features) {
      const [first, ...rest] = wrap(plain(f), W - 8, '');
      L.push(`  ■ ${first}`);
      for (const r of rest) L.push(`    ${r}`);
    }
  }
  const inst = p.install;
  const cmds: [string, string | null][] = [
    ['cargo', inst.cargo],
    ['macOS/Linux', inst.shell],
    ['Windows', inst.powershell],
  ];
  if (cmds.some(([, c]) => c)) {
    L.push('');
    L.push(sectionRule('Install'));
    L.push('');
    let n = 1;
    for (const [k, c] of cmds) {
      if (!c) continue;
      L.push(`  ${n++}. ${k}:`);
      if (c.length <= W - 5) L.push(`     ${c}`);
      else if (k !== 'Windows') {
        // POSIX shells accept "\" line continuations, so the wrapped form still runs
        const parts = wrap(c, W - 9, '');
        parts.forEach((part, i) => L.push(`     ${part}${i < parts.length - 1 ? ' \\' : ''}`));
      } else L.push(`     PowerShell one-liner: ${SITE_URL.replace(/^https?:\/\//, "")}/projects/#${p.slug}`);
    }
  }
  L.push('');
  L.push(sectionRule('Credits'));
  L.push('');
  const names = content.greets.priorArt.map((g) => g.name).concat(content.greets.communities.map((c) => c.name));
  L.push(...wrap(names.join(' · ') + ' · and every modder who kept these games alive.'));
  L.push('');
  L.push(center('─── Life support for the Odyssey engine ───'));
  L.push('');
  return L.join('\n');
}

/** "00" -> "Phase 00"; anything already worded is left alone. */
export const phaseLabel = (phase: string) => (/^\d+$/.test(phase.trim()) ? `Phase ${phase.trim()}` : phase);
