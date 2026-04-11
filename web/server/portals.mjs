import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..');

function loadProfile() {
  const profilePath = resolve(CAREER_OPS_PATH, 'config', 'profile.yml');
  if (!existsSync(profilePath)) return null;
  try {
    return parse(readFileSync(profilePath, 'utf-8'));
  } catch { return null; }
}

export function loadPortals() {
  const paths = [
    resolve(CAREER_OPS_PATH, 'portals.yml'),
    resolve(CAREER_OPS_PATH, 'templates', 'portals.example.yml'),
  ];

  let titleFilter = { positive: ['AI', 'ML', 'LLM'], negative: ['Junior', 'Intern'], seniority_boost: ['Senior', 'Staff', 'Lead'] };
  let searchQueries = [];
  let trackedCompanies = [];

  for (const p of paths) {
    if (existsSync(p)) {
      const config = parse(readFileSync(p, 'utf-8'));
      titleFilter = config.title_filter || titleFilter;
      searchQueries = (config.search_queries || []).filter(q => q.enabled !== false);
      trackedCompanies = (config.tracked_companies || []).filter(c => c.enabled !== false);
      break;
    }
  }

  // Merge profile into title filter — add target roles and archetypes as positive keywords
  const profile = loadProfile();
  if (profile) {
    const extra = [];
    // target_roles.primary
    const roles = profile.target_roles?.primary;
    if (Array.isArray(roles)) {
      for (const r of roles) extra.push(r);
    }
    // target_roles.archetypes
    const archs = profile.target_roles?.archetypes;
    if (Array.isArray(archs)) {
      for (const a of archs) {
        if (a.name) extra.push(a.name);
      }
    }
    // narrative.superpowers
    const powers = profile.narrative?.superpowers;
    if (Array.isArray(powers)) {
      // Only add multi-word superpowers (single words like "fast" are too broad)
      for (const s of powers) {
        if (s.includes(' ')) extra.push(s);
      }
    }

    // Deduplicate and merge into positive keywords
    const existing = new Set(titleFilter.positive.map(k => k.toLowerCase()));
    for (const kw of extra) {
      if (kw && !existing.has(kw.toLowerCase())) {
        titleFilter.positive.push(kw);
        existing.add(kw.toLowerCase());
      }
    }
  }

  return { titleFilter, searchQueries, trackedCompanies, profileMerged: !!profile };
}

export function filterTitle(title, titleFilter) {
  const t = title.toLowerCase();
  const hasPositive = titleFilter.positive.some(kw => t.includes(kw.toLowerCase()));
  const hasNegative = titleFilter.negative.some(kw => t.includes(kw.toLowerCase()));
  const hasSeniority = titleFilter.seniority_boost.some(kw => t.includes(kw.toLowerCase()));
  return { pass: hasPositive && !hasNegative, seniority: hasSeniority };
}
