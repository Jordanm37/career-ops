import { Router } from 'express';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';

const router = Router();
const CAREER_OPS_PATH = process.env.CAREER_OPS_PATH || resolve(import.meta.dirname, '..', '..', '..');
const USER_DATA_PATH = process.env.USER_DATA_PATH || CAREER_OPS_PATH;

// GET /api/cv-sync — check CV vs profile for issues
router.get('/', (req, res) => {
  const cvPath = resolve(USER_DATA_PATH, 'cv.md');
  const profilePath = resolve(USER_DATA_PATH, 'config', 'profile.yml');

  const issues = [];

  const hasCv = existsSync(cvPath);
  const hasProfile = existsSync(profilePath);

  if (!hasCv) issues.push({ severity: 'warning', message: 'No CV uploaded. AI evaluations will lack candidate context.' });
  if (!hasProfile) issues.push({ severity: 'warning', message: 'No profile set up. Scanner discovery and evaluation scoring will be less personalized.' });

  if (hasCv && hasProfile) {
    const cv = readFileSync(cvPath, 'utf-8');
    let profile;
    try {
      profile = parse(readFileSync(profilePath, 'utf-8'));
    } catch (e) {
      issues.push({ severity: 'error', message: 'profile.yml is malformed and cannot be parsed.' });
      profile = null;
    }

    if (profile) {
      // Check freshness
      const cvStat = statSync(cvPath);
      const profileStat = statSync(profilePath);
      const cvUpdated = cvStat.mtime;
      const profileUpdated = profileStat.mtime;

      if (cvUpdated > profileUpdated) {
        const daysStale = Math.floor((cvUpdated - profileUpdated) / (1000 * 60 * 60 * 24));
        if (daysStale > 0) {
          issues.push({
            severity: 'info',
            message: `CV updated ${daysStale} day(s) after profile. Consider refreshing profile from CV.`,
          });
        }
      }

      // Check key field alignment
      const candidate = profile.candidate || {};
      if (!candidate.full_name) issues.push({ severity: 'warning', message: 'Profile missing full_name' });
      if (!candidate.email) issues.push({ severity: 'warning', message: 'Profile missing email' });

      // Check if target_roles is populated
      const targetRoles = (profile.target_roles?.primary || []).map(r => r.toLowerCase());
      if (!targetRoles.length) {
        issues.push({ severity: 'warning', message: "Profile has no target roles. Scanner can't personalize discovery." });
      }

      const superpowers = profile.narrative?.superpowers || [];
      if (!superpowers.length) {
        issues.push({ severity: 'info', message: 'Profile has no superpowers listed. Evaluations will be less specific.' });
      }

      // Check name in CV matches profile
      if (candidate.full_name && !cv.toLowerCase().includes(candidate.full_name.toLowerCase())) {
        issues.push({
          severity: 'warning',
          message: `Profile name "${candidate.full_name}" not found in CV. CV may belong to someone else.`,
        });
      }

      // Check CV length (from cv-sync-check.mjs)
      if (cv.trim().length < 100) {
        issues.push({ severity: 'warning', message: 'cv.md seems too short. Make sure it contains your full CV.' });
      }
    }
  }

  res.json({
    ok: issues.filter(i => i.severity === 'error').length === 0 && issues.length === 0,
    hasCv,
    hasProfile,
    issues,
  });
});

export default router;
