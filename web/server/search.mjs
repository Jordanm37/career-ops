import { getSetting } from './db.mjs';

/**
 * Main entry — unified web search for jobs.
 * @param {string} query - original search query (e.g., "Mechatronics Engineer")
 * @param {number} maxResults - cap total results
 * @param {object} options - { country?: 'au', location?: string }
 */
export async function webSearchJobs(query, maxResults = 10, options = {}) {
  const country = (options.country || 'au').toLowerCase();
  const location = options.location || '';
  const results = [];

  // Source 1: Adzuna
  try {
    const adzunaJobs = await searchAdzuna(query, country, location, maxResults);
    results.push(...adzunaJobs);
  } catch (err) {
    console.error('Adzuna search error:', err.message);
  }

  // Source 2: OpenAI web_search (if we still need more)
  if (results.length < maxResults) {
    try {
      const llmJobs = await searchOpenAI(query, maxResults - results.length);
      results.push(...llmJobs);
    } catch (err) {
      console.error('OpenAI web search error:', err.message);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const deduped = results.filter(j => {
    if (!j.url || seen.has(j.url)) return false;
    seen.add(j.url);
    return true;
  });

  // Verify URLs are live (HEAD requests)
  const verified = await verifyUrls(deduped);

  return verified.slice(0, maxResults);
}

async function searchAdzuna(query, country, location, maxResults) {
  const appId = getSetting('ADZUNA_APP_ID');
  const appKey = getSetting('ADZUNA_APP_KEY');
  if (!appId || !appKey) return [];

  // Expand query with a senior variant to broaden coverage
  const variants = [query, `Senior ${query}`];

  const allResults = [];
  for (const q of variants) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('app_key', appKey);
    url.searchParams.set('results_per_page', '20');
    url.searchParams.set('what', q);
    if (location) url.searchParams.set('where', location);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn(`Adzuna ${res.status} for query "${q}"`);
      continue;
    }
    const data = await res.json();

    for (const job of (data.results || [])) {
      allResults.push({
        title: job.title,
        url: job.redirect_url,
        company: job.company?.display_name || 'Unknown',
        portal: 'Adzuna',
        source: 'adzuna',
      });
      if (allResults.length >= maxResults * 2) break;
    }
  }

  return allResults;
}

async function searchOpenAI(query, maxResults) {
  const apiKey = getSetting('OPENAI_API_KEY');
  if (!apiKey) return [];

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  // Responses API with web_search_preview tool — actual web access, not hallucination
  try {
    const response = await client.responses.create({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      input: `Search the web and find ${maxResults} currently-open job listings matching: "${query}". Return a JSON array only, no prose. Each element: { "title": "...", "company": "...", "url": "https://..." }. URLs must be direct job posting pages, not career index pages.`,
    });

    const text = response.output_text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const jobs = JSON.parse(match[0]);
    return jobs.slice(0, maxResults).map(j => ({
      title: j.title,
      url: j.url,
      company: j.company || 'Unknown',
      portal: 'WebSearch',
      source: 'websearch',
    }));
  } catch (err) {
    // Fallback: gpt-4o-search-preview via chat completions
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-search-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a job discovery assistant with web search access. Return only currently-open job postings with valid, verified URLs.',
          },
          {
            role: 'user',
            content: `Find up to ${maxResults} currently-open job listings matching: "${query}".

Return ONLY a JSON object with this exact shape:
{
  "jobs": [
    { "title": "...", "company": "...", "url": "https://..." }
  ]
}

Rules:
- URLs MUST be specific job pages (e.g., /jobs/123, /posting/abc), NOT company career index pages
- Prefer Greenhouse, Ashby, Lever, Workable, Seek, LinkedIn URLs
- Return empty array if no real jobs found
- No commentary, just JSON`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const data = JSON.parse(content);
      return (data.jobs || []).slice(0, maxResults).map(j => ({
        title: j.title,
        url: j.url,
        company: j.company || 'Unknown',
        portal: 'WebSearch',
        source: 'websearch',
      }));
    } catch (fallbackErr) {
      console.error('OpenAI web search fallback error:', fallbackErr.message);
      return [];
    }
  }
}

// Concurrency-limited parallel HEAD verification
async function verifyUrls(jobs) {
  const CONCURRENCY = 10;
  const verified = [];

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(job => verifyOne(job))
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value !== null) {
        verified.push(r.value);
      }
    }
  }

  return verified;
}

async function verifyOne(job) {
  if (!job.url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(job.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    // Filter bare homepages / catch-all career index redirects
    const finalUrl = new URL(res.url);
    const path = finalUrl.pathname;
    if (
      path.length <= 2 ||
      path === '/careers' ||
      path === '/careers/' ||
      path === '/jobs' ||
      path === '/jobs/'
    ) {
      return null;
    }

    return { ...job, url: res.url };
  } catch {
    return null;
  }
}
