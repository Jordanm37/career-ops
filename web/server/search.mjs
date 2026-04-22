import OpenAI from 'openai';

export async function webSearchJobs(query, maxResults = 10) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const client = new OpenAI({ apiKey });

  const model = process.env.AI_MODEL_WEB || 'gpt-4o-search-preview';

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a job discovery assistant. Search the web and return only currently-open job postings with valid URLs.',
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
- Prefer Greenhouse, Ashby, Lever, Workable, Wellfound URLs
- Return empty array if no real jobs found
- No commentary, just JSON`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const data = JSON.parse(content);
    return (data.jobs || []).map(j => ({
      title: j.title,
      url: j.url,
      company: j.company,
      portal: 'WebSearch',
      source: 'websearch',
    }));
  } catch (err) {
    // Fall back to gpt-4o if search-preview model is unavailable
    if (model !== 'gpt-4o' && err.message?.includes('model')) {
      console.warn('WebSearch: falling back to gpt-4o');
      try {
        const fallback = await new OpenAI({ apiKey }).chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a job discovery assistant. Return only currently-open job postings with valid URLs based on your training knowledge.',
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
- Prefer Greenhouse, Ashby, Lever, Workable, Wellfound URLs
- Return empty array if no real jobs found
- No commentary, just JSON`,
            },
          ],
          response_format: { type: 'json_object' },
        });
        const fbContent = fallback.choices[0]?.message?.content || '{}';
        const fbData = JSON.parse(fbContent);
        return (fbData.jobs || []).map(j => ({
          title: j.title,
          url: j.url,
          company: j.company,
          portal: 'WebSearch',
          source: 'websearch',
        }));
      } catch (fbErr) {
        console.error('WebSearch fallback error:', fbErr.message);
        return [];
      }
    }
    console.error('WebSearch error:', err.message);
    return [];
  }
}
