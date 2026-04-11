import { useState, useEffect } from 'react';
import { saveProfile, fetchProfileStatus, type ProfileData } from '../lib/api';

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

const STEPS = ['CV Upload', 'Personal', 'Target Roles', 'Narrative', 'Compensation', 'Location'] as const;

export default function ProfileSetup({ onComplete, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCv, setHasCv] = useState<boolean | null>(null);
  const [cvText, setCvText] = useState('');
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState<ProfileData>({
    full_name: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    portfolio_url: '',
    github: '',
    target_roles: '',
    archetypes: '',
    headline: '',
    exit_story: '',
    superpowers: '',
    target_range: '',
    currency: '',
    minimum: '',
    location_flexibility: '',
    country: '',
    city: '',
    timezone: '',
    visa_status: '',
  });

  // Check CV status and pre-fill from CV data on mount
  useEffect(() => {
    fetchProfileStatus().then(status => {
      setHasCv(status.hasCv);
      if (status.hasCv) {
        setStep(1); // skip CV upload step
      }
      const parsed = (status as any).cvParsed;
      if (parsed) {
        setForm(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(parsed).filter(([, v]) => v)
          ),
        }));
      }
    }).catch(() => {});
  }, []);

  function update(field: keyof ProfileData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(form);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function renderField(label: string, field: keyof ProfileData, opts?: { placeholder?: string; multiline?: boolean; type?: string }) {
    const value = form[field];
    const common = 'w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue';
    return (
      <div>
        <label className="block text-sm text-ctp-subtext0 mb-1">{label}</label>
        {opts?.multiline ? (
          <textarea
            value={value}
            onChange={e => update(field, e.target.value)}
            placeholder={opts.placeholder}
            rows={3}
            className={`${common} resize-y`}
          />
        ) : (
          <input
            type={opts?.type || 'text'}
            value={value}
            onChange={e => update(field, e.target.value)}
            placeholder={opts?.placeholder}
            className={common}
          />
        )}
      </div>
    );
  }

  async function handleCvUpload() {
    if (!cvText.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch('/api/profile/cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cvText }),
      });
      if (!res.ok) throw new Error('Upload failed');
      // Re-fetch profile to get parsed CV fields
      const status = await fetchProfileStatus();
      setHasCv(true);
      const parsed = (status as any).cvParsed;
      if (parsed) {
        setForm(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(parsed).filter(([, v]) => v)
          ),
        }));
      }
      setStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CV upload failed');
    } finally {
      setUploading(false);
    }
  }

  function renderStep() {
    switch (step) {
      case 0: // CV Upload
        return (
          <div className="space-y-3">
            <p className="text-sm text-ctp-subtext1 mb-2">
              Paste your CV/resume below (markdown or plain text). This will be used to auto-fill your profile and tailor job evaluations.
            </p>
            <textarea
              value={cvText}
              onChange={e => setCvText(e.target.value)}
              placeholder="# Your Name&#10;&#10;**Email:** you@example.com | **Phone:** +1 234 567 890&#10;&#10;Paste your full CV here..."
              rows={14}
              className="w-full bg-ctp-surface0 border border-ctp-surface1 rounded-lg px-3 py-2 text-ctp-text placeholder:text-ctp-overlay0 focus:outline-none focus:border-ctp-blue font-mono text-sm resize-y"
            />
            <button
              onClick={handleCvUpload}
              disabled={!cvText.trim() || uploading}
              className="w-full px-4 py-2 bg-ctp-blue text-ctp-crust font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {uploading ? 'Uploading & parsing...' : 'Upload CV & Continue'}
            </button>
            {hasCv === false && (
              <p className="text-xs text-ctp-overlay0 text-center">
                No CV found. Upload one to auto-fill your profile.
              </p>
            )}
          </div>
        );

      case 1: // Personal
        return (
          <div className="space-y-3">
            <p className="text-sm text-ctp-subtext1 mb-4">
              We've pre-filled your details from your CV. Review and adjust as needed.
            </p>
            {renderField('Full Name', 'full_name')}
            {renderField('Email', 'email', { type: 'email' })}
            {renderField('Phone', 'phone', { type: 'tel' })}
            {renderField('Location', 'location', { placeholder: 'City, Country' })}
            {renderField('LinkedIn', 'linkedin', { placeholder: 'linkedin.com/in/...' })}
            {renderField('Portfolio URL', 'portfolio_url', { placeholder: 'https://...' })}
            {renderField('GitHub', 'github', { placeholder: 'github.com/...' })}
          </div>
        );

      case 2: // Target Roles
        return (
          <div className="space-y-3">
            <p className="text-sm text-ctp-subtext1 mb-4">
              What roles are you targeting? This shapes how evaluations score job fit.
            </p>
            {renderField('Target Roles (comma-separated)', 'target_roles', {
              placeholder: 'AI Engineer, ML Engineer, Robotics Engineer',
            })}
            {renderField('Archetypes (comma-separated)', 'archetypes', {
              placeholder: 'AI Platform / LLMOps, Agentic / Automation',
            })}
            <div className="bg-ctp-surface0 rounded-lg p-3 text-xs text-ctp-subtext0">
              <p className="font-medium text-ctp-subtext1 mb-1">Available archetypes:</p>
              <ul className="space-y-0.5">
                <li><span className="text-ctp-mauve">AI Platform / LLMOps</span> - observability, evals, pipelines, monitoring</li>
                <li><span className="text-ctp-mauve">Agentic / Automation</span> - agents, HITL, orchestration, workflows</li>
                <li><span className="text-ctp-mauve">Technical AI PM</span> - PRD, roadmap, stakeholder, product</li>
                <li><span className="text-ctp-mauve">AI Solutions Architect</span> - architecture, enterprise, integration</li>
                <li><span className="text-ctp-mauve">AI Forward Deployed</span> - client-facing, deploy, prototype</li>
                <li><span className="text-ctp-mauve">AI Transformation</span> - change management, adoption, enablement</li>
              </ul>
            </div>
          </div>
        );

      case 3: // Narrative
        return (
          <div className="space-y-3">
            <p className="text-sm text-ctp-subtext1 mb-4">
              Your professional story. This helps the AI frame you in evaluations and CVs.
            </p>
            {renderField('Professional Headline (1 line)', 'headline', {
              placeholder: 'What you do in one sentence',
            })}
            {renderField('Your Story', 'exit_story', {
              multiline: true,
              placeholder: 'What makes you unique? Your career narrative...',
            })}
            {renderField('Superpowers (comma-separated)', 'superpowers', {
              multiline: true,
              placeholder: 'Your top 3-5 strengths',
            })}
          </div>
        );

      case 4: // Compensation
        return (
          <div className="space-y-3">
            <p className="text-sm text-ctp-subtext1 mb-4">
              Optional but helps score compensation fit. Leave blank if you prefer not to set targets.
            </p>
            {renderField('Target Salary Range', 'target_range', { placeholder: '$80K-120K' })}
            <div className="grid grid-cols-2 gap-3">
              {renderField('Currency', 'currency', { placeholder: 'AUD' })}
              {renderField('Walk-away Minimum', 'minimum', { placeholder: '$60K' })}
            </div>
            {renderField('Location Flexibility', 'location_flexibility', {
              placeholder: 'Remote preferred, open to hybrid...',
            })}
          </div>
        );

      case 5: // Location
        return (
          <div className="space-y-3">
            <p className="text-sm text-ctp-subtext1 mb-4">
              Location details for geographic matching and visa filtering.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {renderField('Country', 'country')}
              {renderField('City', 'city')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {renderField('Timezone', 'timezone', { placeholder: 'AEST' })}
              {renderField('Visa / Work Rights', 'visa_status', { placeholder: 'No sponsorship needed' })}
            </div>
          </div>
        );
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-ctp-mantle rounded-xl border border-ctp-surface1 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-ctp-blue">Profile Setup</h2>
            <button onClick={onClose} className="text-ctp-subtext0 hover:text-ctp-text text-xl px-2">x</button>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(i)}
                className={`flex-1 text-center py-1.5 text-xs font-medium rounded transition-colors ${
                  i === step
                    ? 'bg-ctp-blue text-ctp-crust'
                    : i < step
                    ? 'bg-ctp-green/20 text-ctp-green'
                    : 'bg-ctp-surface0 text-ctp-subtext0'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-ctp-mantle border-t border-ctp-surface1 px-6 py-4 flex justify-between items-center">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-ctp-subtext0 hover:text-ctp-text disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Back
          </button>

          {error && (
            <span className="text-sm text-ctp-red">{error}</span>
          )}

          {isLast ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-ctp-green text-ctp-crust font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          ) : (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2 bg-ctp-blue text-ctp-crust font-medium rounded-lg hover:opacity-90 transition-opacity"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
