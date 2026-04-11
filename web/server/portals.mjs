import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..');

export function loadPortals() {
  const paths = [
    resolve(CAREER_OPS_PATH, 'portals.yml'),
    resolve(CAREER_OPS_PATH, 'templates', 'portals.example.yml'),
  ];

  for (const p of paths) {
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf-8');
      const config = parse(raw);
      return {
        titleFilter: config.title_filter || { positive: [], negative: [], seniority_boost: [] },
        searchQueries: (config.search_queries || []).filter(q => q.enabled !== false),
        trackedCompanies: (config.tracked_companies || [])
          .filter(c => c.enabled !== false),
      };
    }
  }

  // Return defaults if no config found
  return {
    titleFilter: {
      positive: ['AI', 'ML', 'LLM'],
      negative: ['Junior', 'Intern'],
      seniority_boost: ['Senior', 'Staff', 'Lead'],
    },
    searchQueries: [],
    trackedCompanies: [],
  };
}

export function filterTitle(title, titleFilter) {
  const t = title.toLowerCase();
  const hasPositive = titleFilter.positive.some(kw => t.includes(kw.toLowerCase()));
  const hasNegative = titleFilter.negative.some(kw => t.includes(kw.toLowerCase()));
  const hasSeniority = titleFilter.seniority_boost.some(kw => t.includes(kw.toLowerCase()));
  return { pass: hasPositive && !hasNegative, seniority: hasSeniority };
}
