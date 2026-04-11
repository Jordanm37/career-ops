import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import OpenAI from 'openai';

const router = Router();
const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..', '..');

// Cache parsed CV to avoid re-calling LLM on every request
let cvParseCache = { hash: null, result: null };

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}

async function parseCvWithLLM(cvText) {
  const hash = simpleHash(cvText);
  if (cvParseCache.hash === hash && cvParseCache.result) return cvParseCache.result;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return parseCvRegex(cvText); // fallback to regex if no key

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'cv_profile',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            full_name: { type: 'string', description: 'Full name' },
            email: { type: 'string', description: 'Email address' },
            phone: { type: 'string', description: 'Phone number with country code' },
            location: { type: 'string', description: 'City, Country' },
            linkedin: { type: 'string', description: 'LinkedIn URL or profile path' },
            github: { type: 'string', description: 'GitHub URL or username' },
            portfolio_url: { type: 'string', description: 'Portfolio or personal website URL' },
            headline: { type: 'string', description: 'One-line professional headline summarizing the person' },
            superpowers: { type: 'string', description: 'Top 3-5 technical strengths, comma-separated' },
            target_roles: { type: 'string', description: 'Best-fit job titles based on experience, comma-separated' },
            country: { type: 'string', description: 'Country of residence' },
            city: { type: 'string', description: 'City of residence' },
            visa_status: { type: 'string', description: 'Citizenship or work authorization' },
          },
          required: ['full_name', 'email', 'phone', 'location', 'linkedin', 'github',
            'portfolio_url', 'headline', 'superpowers', 'target_roles', 'country', 'city', 'visa_status'],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: 'system',
        content: `You are a CV parser. Extract structured profile fields from the CV text below.
Rules:
- Return empty string "" for any field not found in the CV.
- For headline: write a concise one-line summary of who this person is professionally.
- For superpowers: extract their top 3-5 technical strengths from skills/experience sections.
- For target_roles: infer 2-4 best-fit job titles based on their experience and skills.
- Be precise — do not invent information not present in the CV.`,
      },
      { role: 'user', content: cvText },
    ],
  });

  const result = JSON.parse(response.choices[0].message.content);
  cvParseCache = { hash, result };
  return result;
}

function parseCvRegex(cv) {
  const fields = {};
  const nameMatch = cv.match(/^#\s+(.+)/m);
  if (nameMatch) fields.full_name = nameMatch[1].trim();
  const emailMatch = cv.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) fields.email = emailMatch[0];
  const phoneMatch = cv.match(/\+?\d[\d\s()-]{7,}/);
  if (phoneMatch) fields.phone = phoneMatch[0].trim();
  const linkedinMatch = cv.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  if (linkedinMatch) fields.linkedin = linkedinMatch[0];
  const githubMatch = cv.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i);
  if (githubMatch) fields.github = githubMatch[0];
  const citizenMatch = cv.match(/Citizenship[:\s]*([^\n|]+)/i);
  if (citizenMatch) fields.visa_status = citizenMatch[1].trim();
  return fields;
}

function getProfilePath() {
  return resolve(CAREER_OPS_PATH, 'config', 'profile.yml');
}

function getCvPath() {
  return resolve(CAREER_OPS_PATH, 'cv.md');
}

// GET /api/profile — returns current profile + cv status
router.get('/', async (req, res) => {
  const profilePath = getProfilePath();
  const cvPath = getCvPath();

  const result = {
    hasProfile: existsSync(profilePath),
    hasCv: existsSync(cvPath),
    profile: null,
    cvPreview: null,
    cvParsed: null,
  };

  if (result.hasProfile) {
    result.profile = readFileSync(profilePath, 'utf-8');
  }

  if (result.hasCv) {
    const cv = readFileSync(cvPath, 'utf-8');
    result.cvPreview = cv.substring(0, 500);
    try {
      result.cvParsed = await parseCvWithLLM(cv);
    } catch (err) {
      console.error('LLM CV parse failed, using regex fallback:', err.message);
      result.cvParsed = parseCvRegex(cv);
    }
  }

  res.json(result);
});

// POST /api/profile — save profile.yml from form data
router.post('/', (req, res) => {
  const {
    full_name, email, phone, location, linkedin, portfolio_url, github,
    target_roles, archetypes,
    headline, exit_story, superpowers,
    target_range, currency, minimum, location_flexibility,
    country, city, timezone, visa_status,
  } = req.body;

  // Build YAML
  const yaml = [
    '# Career-Ops Profile Configuration',
    '# Generated by Career-Ops Web Dashboard',
    '',
    'candidate:',
    `  full_name: "${full_name || ''}"`,
    `  email: "${email || ''}"`,
    `  phone: "${phone || ''}"`,
    `  location: "${location || ''}"`,
    `  linkedin: "${linkedin || ''}"`,
    `  portfolio_url: "${portfolio_url || ''}"`,
    `  github: "${github || ''}"`,
    '',
    'target_roles:',
    '  primary:',
  ];

  // Target roles
  const roles = (target_roles || '').split(',').map(r => r.trim()).filter(Boolean);
  for (const role of roles) {
    yaml.push(`    - "${role}"`);
  }
  if (roles.length === 0) yaml.push('    - "Engineer"');

  // Archetypes
  yaml.push('  archetypes:');
  const archetypeList = (archetypes || '').split(',').map(a => a.trim()).filter(Boolean);
  for (const arch of archetypeList) {
    yaml.push(`    - name: "${arch}"`);
    yaml.push('      level: "Mid-Senior"');
    yaml.push('      fit: "primary"');
  }
  if (archetypeList.length === 0 && roles.length > 0) {
    yaml.push(`    - name: "${roles[0]}"`);
    yaml.push('      level: "Mid-Senior"');
    yaml.push('      fit: "primary"');
  }

  yaml.push('');
  yaml.push('narrative:');
  yaml.push(`  headline: "${headline || ''}"`);
  yaml.push(`  exit_story: "${exit_story || ''}"`);
  yaml.push('  superpowers:');
  const powers = (superpowers || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const s of powers) {
    yaml.push(`    - "${s}"`);
  }

  yaml.push('');
  yaml.push('compensation:');
  yaml.push(`  target_range: "${target_range || ''}"`);
  yaml.push(`  currency: "${currency || 'USD'}"`);
  yaml.push(`  minimum: "${minimum || ''}"`);
  yaml.push(`  location_flexibility: "${location_flexibility || ''}"`);

  yaml.push('');
  yaml.push('location:');
  yaml.push(`  country: "${country || ''}"`);
  yaml.push(`  city: "${city || ''}"`);
  yaml.push(`  timezone: "${timezone || ''}"`);
  yaml.push(`  visa_status: "${visa_status || ''}"`);
  yaml.push('');

  const profilePath = getProfilePath();
  mkdirSync(dirname(profilePath), { recursive: true });
  writeFileSync(profilePath, yaml.join('\n'));
  res.json({ success: true, path: profilePath });
});

export default router;
