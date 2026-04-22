import { useState, useEffect } from 'react';

interface CustomCompany {
  id: number;
  name: string;
  careers_url: string;
  api: string | null;
  category: string;
  scan_method: string | null;
  enabled: number;
  created_at: string;
}

interface Props {
  onClose: () => void;
  categories: string[];
}

const SCAN_METHODS = ['auto', 'playwright', 'websearch', 'greenhouse_api'] as const;

export default function CompaniesManager({ onClose, categories }: Props) {
  const [companies, setCompanies] = useState<CustomCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formCategoryCustom, setFormCategoryCustom] = useState('');
  const [formApi, setFormApi] = useState('');
  const [formScanMethod, setFormScanMethod] = useState('auto');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const effectiveCategory = formCategory === '__custom__' ? formCategoryCustom : formCategory;

  async function loadCompanies() {
    try {
      const res = await fetch('/api/scan/companies');
      if (res.ok) {
        setCompanies(await res.json());
      }
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function handleDelete(id: number) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/scan/companies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
      } else {
        setError('Failed to delete company');
      }
    } catch {
      setError('Failed to delete company');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);

    const category = effectiveCategory.trim();
    if (!formName.trim() || !formUrl.trim() || !category) {
      setFormError('Name, careers URL, and category are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/scan/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          careers_url: formUrl.trim(),
          api: formApi.trim() || null,
          category,
          scan_method: formScanMethod !== 'auto' ? formScanMethod : null,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setFormError(body.error || 'Failed to add company');
        return;
      }

      setFormSuccess(true);
      setFormName('');
      setFormUrl('');
      setFormApi('');
      setFormCategory('');
      setFormCategoryCustom('');
      setFormScanMethod('auto');
      await loadCompanies();
    } catch {
      setFormError('Failed to add company');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-ctp-mantle rounded-xl border border-ctp-surface1 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-ctp-mantle border-b border-ctp-surface1 px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold text-ctp-blue">Manage Companies</h2>
          <button
            onClick={onClose}
            className="text-ctp-subtext0 hover:text-ctp-text text-xl px-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">

          {/* Existing custom companies */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ctp-subtext1">
              Custom Companies
              {!loading && (
                <span className="ml-2 text-ctp-overlay0 font-normal">({companies.length})</span>
              )}
            </h3>

            {error && (
              <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg px-4 py-3 text-sm text-ctp-red">
                {error}
              </div>
            )}

            {loading ? (
              <p className="text-xs text-ctp-overlay0 py-2">Loading…</p>
            ) : companies.length === 0 ? (
              <p className="text-xs text-ctp-overlay0 py-2">No custom companies added yet.</p>
            ) : (
              <div className="rounded-xl border border-ctp-surface1 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ctp-surface0 text-left">
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">Name</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">Category</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide">Method</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-ctp-subtext0 uppercase tracking-wide text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ctp-surface0">
                    {companies.map((c) => (
                      <tr key={c.id} className="bg-ctp-mantle hover:bg-ctp-surface0 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-ctp-text font-medium">{c.name}</div>
                          <a
                            href={c.careers_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-ctp-overlay1 hover:text-ctp-blue hover:underline truncate block max-w-[180px]"
                            title={c.careers_url}
                          >
                            {c.careers_url}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-ctp-subtext1 text-xs">{c.category}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-ctp-surface1 text-ctp-subtext0">
                            {c.scan_method || 'auto'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            className="px-3 py-1 text-xs font-medium rounded-md bg-ctp-surface1 text-ctp-subtext0 border border-ctp-surface2 hover:text-ctp-red hover:border-ctp-red/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingId === c.id ? 'Removing…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add form */}
          <div className="border border-ctp-surface1 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-ctp-surface0 border-b border-ctp-surface1">
              <span className="text-sm font-medium text-ctp-subtext1">Add Company</span>
            </div>

            <form onSubmit={handleSubmit} className="px-4 py-4 bg-ctp-mantle space-y-4">
              {formError && (
                <div className="bg-ctp-red/10 border border-ctp-red/30 rounded-lg px-4 py-3 text-sm text-ctp-red">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="bg-ctp-green/10 border border-ctp-green/30 rounded-lg px-4 py-3 text-sm text-ctp-green">
                  Company added successfully.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ctp-subtext0">
                    Company Name <span className="text-ctp-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-blue transition-colors"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ctp-subtext0">
                    Category <span className="text-ctp-red">*</span>
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-sm text-ctp-text focus:outline-none focus:border-ctp-blue transition-colors"
                  >
                    <option value="">Select or type new…</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__custom__">+ New category…</option>
                  </select>
                  {formCategory === '__custom__' && (
                    <input
                      type="text"
                      value={formCategoryCustom}
                      onChange={(e) => setFormCategoryCustom(e.target.value)}
                      placeholder="New category name"
                      className="w-full mt-1 bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-blue transition-colors"
                    />
                  )}
                </div>
              </div>

              {/* Careers URL */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-ctp-subtext0">
                  Careers URL <span className="text-ctp-red">*</span>
                </label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://acme.com/careers"
                  className="w-full bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-blue transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* API URL */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ctp-subtext0">API URL <span className="text-ctp-overlay0">(optional)</span></label>
                  <input
                    type="url"
                    value={formApi}
                    onChange={(e) => setFormApi(e.target.value)}
                    placeholder="https://boards-api.greenhouse.io/…"
                    className="w-full bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-sm text-ctp-text placeholder-ctp-overlay0 focus:outline-none focus:border-ctp-blue transition-colors"
                  />
                </div>

                {/* Scan method */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-ctp-subtext0">Scan Method</label>
                  <select
                    value={formScanMethod}
                    onChange={(e) => setFormScanMethod(e.target.value)}
                    className="w-full bg-ctp-surface0 border border-ctp-surface2 rounded-lg px-3 py-2 text-sm text-ctp-text focus:outline-none focus:border-ctp-blue transition-colors"
                  >
                    {SCAN_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-ctp-blue text-ctp-crust font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                >
                  {submitting ? 'Adding…' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
