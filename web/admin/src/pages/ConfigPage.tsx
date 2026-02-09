import { useEffect, useState, type FormEvent } from 'react';
import LoadingSpinner from '../components/common/LoadingSpinner.tsx';
import Button from '../components/ui/Button.tsx';
import Input from '../components/ui/Input.tsx';
import { Select } from '../components/ui/Input.tsx';
import * as api from '../services/api-client.ts';

interface ConfigValues {
  scan_enabled: boolean;
  scan_interval_minutes: number;
  max_file_age_hours: number;
  max_file_size_mb: number;
  heartbeat_interval_seconds: number;
  worker_timeout_seconds: number;
  max_concurrent_uploads: number;
  retry_failed_uploads: boolean;
  retry_delay_seconds: number;
  log_level: string;
  auto_approve_clients: boolean;
  rate_limit_files_per_hour: number;
  max_clients: number;
}

const defaults: ConfigValues = {
  scan_enabled: true,
  scan_interval_minutes: 60,
  max_file_age_hours: 24,
  max_file_size_mb: 10,
  heartbeat_interval_seconds: 3600,
  worker_timeout_seconds: 30,
  max_concurrent_uploads: 3,
  retry_failed_uploads: true,
  retry_delay_seconds: 300,
  log_level: 'info',
  auto_approve_clients: false,
  rate_limit_files_per_hour: 100,
  max_clients: 1000,
};

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigValues>(defaults);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api
      .getConfig('default_client_config')
      .then((entry) => {
        if (entry.value && typeof entry.value === 'object') {
          setConfig((prev) => ({ ...prev, ...(entry.value as Partial<ConfigValues>) }));
        }
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.setConfig('default_client_config', config);
      setMessage({ type: 'success', text: 'Configuration saved successfully' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setConfig(defaults);
    setMessage(null);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Configuration</h1>

      {message && (
        <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-gray-900 rounded-lg border border-gray-800 divide-y divide-gray-800">
        <Section title="Scanning Behavior">
          <Toggle label="Scan Enabled" checked={config.scan_enabled} onChange={(v) => setConfig((c) => ({ ...c, scan_enabled: v }))} />
          <NumberField label="Scan Interval (minutes)" value={config.scan_interval_minutes} onChange={(v) => setConfig((c) => ({ ...c, scan_interval_minutes: v }))} />
          <NumberField label="Max File Age (hours)" value={config.max_file_age_hours} onChange={(v) => setConfig((c) => ({ ...c, max_file_age_hours: v }))} />
          <NumberField label="Max File Size (MB)" value={config.max_file_size_mb} onChange={(v) => setConfig((c) => ({ ...c, max_file_size_mb: v }))} />
          <NumberField label="Worker Timeout (seconds)" value={config.worker_timeout_seconds} onChange={(v) => setConfig((c) => ({ ...c, worker_timeout_seconds: v }))} />
          <NumberField label="Max Concurrent Uploads" value={config.max_concurrent_uploads} onChange={(v) => setConfig((c) => ({ ...c, max_concurrent_uploads: v }))} />
        </Section>

        <Section title="Communication">
          <NumberField label="Heartbeat Interval (seconds)" value={config.heartbeat_interval_seconds} onChange={(v) => setConfig((c) => ({ ...c, heartbeat_interval_seconds: v }))} />
          <Toggle label="Retry Failed Uploads" checked={config.retry_failed_uploads} onChange={(v) => setConfig((c) => ({ ...c, retry_failed_uploads: v }))} />
          <NumberField label="Retry Delay (seconds)" value={config.retry_delay_seconds} onChange={(v) => setConfig((c) => ({ ...c, retry_delay_seconds: v }))} />
          <SelectField label="Log Level" value={config.log_level} options={['debug', 'info', 'warn', 'error']} onChange={(v) => setConfig((c) => ({ ...c, log_level: v }))} />
        </Section>

        <Section title="Server Settings">
          <Toggle label="Auto-approve Clients" checked={config.auto_approve_clients} onChange={(v) => setConfig((c) => ({ ...c, auto_approve_clients: v }))} />
          <NumberField label="Rate Limit (files/hr)" value={config.rate_limit_files_per_hour} onChange={(v) => setConfig((c) => ({ ...c, rate_limit_files_per_hour: v }))} />
          <NumberField label="Max Clients" value={config.max_clients} onChange={(v) => setConfig((c) => ({ ...c, max_clients: v }))} />
        </Section>

        <div className="p-6 flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={handleReset}>
            Reset to Defaults
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-gray-100 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-300">{label}</label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        compact
        className="w-28 text-right"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-300">{label}</label>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-700'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-300">{label}</label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        compact
        className="w-28"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </Select>
    </div>
  );
}
