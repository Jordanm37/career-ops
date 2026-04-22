import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { listCustomCompanies } from './db.mjs';

const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..');
const USER_DATA_PATH = process.env.USER_DATA_PATH || CAREER_OPS_PATH;

function loadProfile() {
  const profilePath = resolve(USER_DATA_PATH, 'config', 'profile.yml');
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
        if (!a.name) continue;
        for (const part of a.name.split(/[\/,]/).map(s => s.trim()).filter(Boolean)) {
          extra.push(part);
        }
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

    // Strip negative keywords that conflict with profile-driven positives
    const positiveLower = titleFilter.positive.map(k => k.toLowerCase());
    titleFilter.negative = titleFilter.negative.filter(neg => {
      const n = neg.toLowerCase();
      return !positiveLower.some(p => p.includes(n) || n.includes(p));
    });
  }

  // Generate profile-driven search queries
  if (profile) {
    const country = profile.location?.country;
    const roles = profile.target_roles?.primary || [];
    for (const role of roles) {
      searchQueries.push({
        name: `Profile — ${role}`,
        query: `"${role}" ${country || 'remote'} site:jobs.ashbyhq.com OR site:job-boards.greenhouse.io OR site:jobs.lever.co`,
        enabled: true,
        profileDriven: true,
      });
    }
  }

  // Merge custom companies from SQLite
  try {
    const custom = listCustomCompanies();
    for (const c of custom) {
      trackedCompanies.push({
        name: c.name,
        careers_url: c.careers_url,
        api: c.api || undefined,
        category: c.category,
        scan_method: c.scan_method || undefined,
        enabled: true,
        custom: true,
      });
    }
  } catch (err) {
    // DB might not be initialized yet
  }

  const categories = [...new Set(trackedCompanies.map(c => c.category).filter(Boolean))].sort();

  return { titleFilter, searchQueries, trackedCompanies, profileMerged: !!profile, categories };
}

export function filterTitle(title, titleFilter) {
  const t = title.toLowerCase();
  const hasPositive = titleFilter.positive.some(kw => t.includes(kw.toLowerCase()));
  const hasNegative = titleFilter.negative.some(kw => t.includes(kw.toLowerCase()));
  const hasSeniority = titleFilter.seniority_boost.some(kw => t.includes(kw.toLowerCase()));
  return { pass: hasPositive && !hasNegative, seniority: hasSeniority };
}
