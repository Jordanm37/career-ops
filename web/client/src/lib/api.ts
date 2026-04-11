const BASE = '/api';

export interface Application {
  id: number;
  date: string;
  company: string;
  role: string;
  score: number | null;
  score_raw: string | null;
  status: string;
  status_normalized: string;
  has_pdf: number;
  report_path: string | null;
  notes: string | null;
  job_url: string | null;
  archetype: string | null;
  tldr: string | null;
  remote: string | null;
  comp_estimate: string | null;
}

export interface Metrics {
  total: number;
  avg_score: number | null;
  top_score: number | null;
  with_pdf: number;
  byStatus: Record<string, number>;
}

export interface Report {
  application_id: number;
  company: string;
  role: string;
  content: string;
  created_at: string;
}

export async function fetchApplications(params?: {
  filter?: string;
  sort?: string;
  order?: string;
}): Promise<Application[]> {
  const query = new URLSearchParams();
  if (params?.filter) query.set('filter', params.filter);
  if (params?.sort) query.set('sort', params.sort);
  if (params?.order) query.set('order', params.order);
  const res = await fetch(`${BASE}/applications?${query}`);
  if (!res.ok) throw new Error('Failed to fetch applications');
  return res.json();
}

export async function fetchMetrics(): Promise<Metrics> {
  const res = await fetch(`${BASE}/applications/metrics`);
  if (!res.ok) throw new Error('Failed to fetch metrics');
  return res.json();
}

export async function fetchReport(appId: number): Promise<Report> {
  const res = await fetch(`${BASE}/applications/${appId}/report`);
  if (!res.ok) throw new Error('Report not found');
  return res.json();
}

export async function updateApplication(
  id: number,
  data: { status?: string; notes?: string },
): Promise<Application> {
  const res = await fetch(`${BASE}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export interface ProfileStatus {
  hasProfile: boolean;
  hasCv: boolean;
  profile: string | null;
  cvPreview: string | null;
}

export interface ProfileData {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio_url: string;
  github: string;
  target_roles: string;
  archetypes: string;
  headline: string;
  exit_story: string;
  superpowers: string;
  target_range: string;
  currency: string;
  minimum: string;
  location_flexibility: string;
  country: string;
  city: string;
  timezone: string;
  visa_status: string;
}

export async function fetchProfileStatus(): Promise<ProfileStatus> {
  const res = await fetch(`${BASE}/profile`);
  return res.json();
}

export async function saveProfile(data: ProfileData): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function* streamEvaluation(data: {
  jd_text?: string;
  jd_url?: string;
  company?: string;
  role?: string;
}): AsyncGenerator<{ type: string; content?: string; application_id?: number; error?: string }> {
  const res = await fetch(`${BASE}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Evaluation failed');
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        yield JSON.parse(line.slice(6));
      }
    }
  }
}
