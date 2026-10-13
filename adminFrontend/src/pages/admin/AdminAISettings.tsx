import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton.tsx';
import api from '@/lib/axios.ts';
import toast from 'react-hot-toast';
import PageHeader from './shared/PageHeader';
import { Panel } from './shared/Panel';
import StatusPill from './shared/StatusPill';
import { formatStamp } from './shared/format';

export interface AIModelSpec {
  slug: string;
  label?: string;
  badge?: string;
  description?: string;
  recommendedTokens?: number;
  recommendedTemp?: number;
  free?: boolean;
}

export interface AIProviderPreset {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultModel: string;
  defaultTokens?: number;
  defaultTemp?: number;
  suggestedModels: (string | AIModelSpec)[];
  free?: boolean;
}

const PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'groq',
    name: 'Groq Cloud',
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
    defaultTokens: 1024,
    defaultTemp: 0.3,
    suggestedModels: ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile'],
    free: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'z-ai/glm-5.2:free',
    defaultTokens: 2048,
    defaultTemp: 0.3,
    suggestedModels: [
      {
        slug: 'z-ai/glm-5.2:free',
        label: 'GLM 5.2',
        badge: 'FREE • 1M Context',
        description: 'Z.ai frontier reasoning model with 1M context. Ideal for complex financial analysis, data diagnostics, and tax compliance calculations.',
        recommendedTokens: 2048,
        recommendedTemp: 0.3,
        free: true,
      },
      {
        slug: 'thinkingmachines/inkling-small:free',
        label: 'Inkling Small',
        badge: 'FREE • 276B MoE',
        description: 'Thinking Machines Lab 276B MoE (12B active) multimodal model with 512K context. Built for fast agentic reasoning and tool execution.',
        recommendedTokens: 2048,
        recommendedTemp: 0.3,
        free: true,
      },
      {
        slug: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        label: 'Nemotron 3 Ultra 550B',
        badge: 'FREE • 550B MoE',
        description: 'NVIDIA 550B MoE (55B active) Transformer-Mamba hybrid model with 1M context. Outstanding for multi-step financial logic and planning.',
        recommendedTokens: 2048,
        recommendedTemp: 0.2,
        free: true,
      },
      {
        slug: 'openrouter/free',
        label: 'OpenRouter Auto Free',
        badge: 'FREE • Auto-Router',
        description: 'Dynamic meta-endpoint routing queries to the most responsive free models available on OpenRouter.',
        recommendedTokens: 1024,
        recommendedTemp: 0.3,
        free: true,
      },
      {
        slug: 'meta-llama/llama-3.3-70b-instruct:free',
        label: 'LLaMA 3.3 70B',
        badge: 'FREE',
        description: 'Meta 70B instruct model. Fast, dependable standard dialogue.',
        recommendedTokens: 1024,
        recommendedTemp: 0.3,
        free: true,
      },
      {
        slug: 'deepseek/deepseek-r1:free',
        label: 'DeepSeek R1',
        badge: 'FREE • Reasoning',
        description: 'DeepSeek open reasoning model with built-in chain of thought.',
        recommendedTokens: 2048,
        recommendedTemp: 0.2,
        free: true,
      },
    ],
    free: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    free: true,
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    provider: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2',
    suggestedModels: ['grok-2', 'grok-beta'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'custom',
    name: 'Custom / Ollama',
    provider: 'custom',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3:latest',
    suggestedModels: ['llama3:latest', 'mistral', 'qwen2.5:14b'],
  },
];

const inputClass =
  'h-8 w-full rounded border border-hairline-strong bg-panel px-2.5 font-mono text-xs text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 focus:outline-none';

const fieldLabel = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-ink-muted';
const inlineFieldLabel = 'text-[10px] font-semibold uppercase tracking-wider text-ink-muted';

/** Matches SegmentedControl's pill shape; the badge is the only delta. */
const pillBase =
  'inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none';

export default function AdminAISettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('groq');
  const [provider, setProvider] = useState('groq');
  const [name, setName] = useState('Groq Cloud');
  const [baseUrl, setBaseUrl] = useState('https://api.groq.com/openai/v1');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [model, setModel] = useState('qwen/qwen3.8-27b');
  const [temperature, setTemperature] = useState<number>(0.3);
  const [maxTokens, setMaxTokens] = useState<number>(1024);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // Test Connection Feedback
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    latencyMs?: number;
    reply?: string;
    error?: string;
  } | null>(null);

  // Load existing configuration
  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/settings/ai');
      const data = res.data?.data;
      if (data) {
        setProvider(data.provider || 'groq');
        setName(data.name || 'Groq Cloud');
        setBaseUrl(data.baseUrl || 'https://api.groq.com/openai/v1');
        setMaskedApiKey(data.maskedApiKey || '');
        setHasApiKey(data.hasApiKey || false);
        setModel(data.model || 'qwen/qwen3.8-27b');
        setTemperature(data.temperature !== undefined ? Number(data.temperature) : 0.3);
        setMaxTokens(data.maxTokens || 1024);
        setIsActive(data.isActive !== undefined ? data.isActive : true);
        setUpdatedAt(data.updatedAt || null);

        // Match with known preset if possible
        const matchingPreset = PROVIDER_PRESETS.find(
          (p) => p.provider === data.provider || data.baseUrl.includes(p.id)
        );
        if (matchingPreset) {
          setSelectedPresetId(matchingPreset.id);
        } else {
          setSelectedPresetId('custom');
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSelectPreset = (preset: AIProviderPreset) => {
    setSelectedPresetId(preset.id);
    setProvider(preset.provider);
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setModel(preset.defaultModel);
    if (preset.defaultTokens) setMaxTokens(preset.defaultTokens);
    if (preset.defaultTemp !== undefined) setTemperature(preset.defaultTemp);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);

      const payload = {
        provider,
        baseUrl,
        apiKey: apiKey.trim() || undefined,
        model,
      };

      const res = await api.post('/admin/settings/ai/test', payload);
      const result = res.data?.data;

      if (result?.success) {
        setTestResult({
          tested: true,
          success: true,
          latencyMs: result.latencyMs,
          reply: result.reply,
        });
        toast.success(`Connection verified (${result.latencyMs}ms)!`);
      } else {
        setTestResult({
          tested: true,
          success: false,
          error: result?.error || 'Connection failed',
        });
        toast.error(result?.error || 'Connection failed');
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Connection test error';
      setTestResult({
        tested: true,
        success: false,
        error: errorMsg,
      });
      toast.error(errorMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!baseUrl.trim()) {
      toast.error('Base URL is required');
      return;
    }
    if (!model.trim()) {
      toast.error('Model identifier is required');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        provider,
        name,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined, // If empty, backend retains existing encrypted key
        model: model.trim(),
        temperature,
        maxTokens,
        isActive,
      };

      const res = await api.put('/admin/settings/ai', payload);
      const data = res.data?.data;

      toast.success('AI Provider configuration saved and activated!');
      setApiKey(''); // Clear raw input field for security
      if (data) {
        setMaskedApiKey(data.maskedApiKey || '');
        setHasApiKey(data.hasApiKey || false);
        setUpdatedAt(data.updatedAt || new Date().toISOString());
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update AI settings');
    } finally {
      setSaving(false);
    }
  };

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === selectedPresetId);

  const matchedModelItem = currentPreset?.suggestedModels?.find((item) => {
    const slug = typeof item === 'string' ? item : item.slug;
    return slug === model;
  });

  const activeModelSpec: AIModelSpec | null =
    typeof matchedModelItem === 'object'
      ? matchedModelItem
      : matchedModelItem
        ? { slug: matchedModelItem, free: matchedModelItem.includes(':free') }
        : null;

  if (loading) {
    return (
      <div className='max-w-3xl space-y-4'>
        <Skeleton width={200} height={26} rounded='lg' />
        <Skeleton width='100%' height={56} rounded='lg' />
        <Skeleton width='100%' height={420} rounded='lg' />
      </div>
    );
  }

  return (
    <div className='max-w-3xl space-y-4 pb-12'>
      <PageHeader
        title='AI Settings'
        hint='Configure the AI provider, model, and credentials powering the SME assistant.'
        actions={
          <button
            type='button'
            onClick={() => setIsActive(!isActive)}
            aria-pressed={isActive}
            className='rounded focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
            title='Toggles whether the assistant is enabled once you save'
          >
            <StatusPill tone={isActive ? 'success' : 'danger'}>
              {isActive ? 'Active (Live)' : 'Disabled'}
            </StatusPill>
          </button>
        }
      />

      <Panel className='px-3 py-2.5'>
        <p className='mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
          Provider preset
        </p>
        <div className='flex flex-wrap gap-1.5'>
          {PROVIDER_PRESETS.map((p) => {
            const isSelected = selectedPresetId === p.id;
            return (
              <button
                key={p.id}
                type='button'
                aria-pressed={isSelected}
                onClick={() => handleSelectPreset(p)}
                className={`${pillBase} ${
                  isSelected
                    ? 'border-hairline-strong bg-ink font-semibold text-panel'
                    : 'border-hairline bg-panel text-ink-muted hover:bg-panel-subtle hover:text-ink'
                }`}
              >
                {p.name}
                {p.free && (
                  <span
                    className={`rounded px-1 text-[9px] font-semibold uppercase tracking-wider ${
                      isSelected
                        ? 'bg-white/15 text-panel'
                        : 'border border-success-200 bg-success-50 text-success-700'
                    }`}
                  >
                    Free
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Panel>

      <form onSubmit={handleSave}>
        <Panel className='divide-y divide-hairline'>
          <div className='grid grid-cols-1 gap-4 p-3 sm:grid-cols-2'>
            <div>
              <label htmlFor='ai-name' className={fieldLabel}>
                Provider name
              </label>
              <input
                id='ai-name'
                type='text'
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. Groq Cloud or OpenRouter'
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor='ai-provider' className={fieldLabel}>
                Provider protocol
              </label>
              <select
                id='ai-provider'
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value='groq'>Groq Cloud (OpenAI-compatible)</option>
                <option value='openrouter'>OpenRouter</option>
                <option value='openai'>OpenAI (ChatGPT)</option>
                <option value='gemini'>Google Gemini</option>
                <option value='xai'>xAI (Grok)</option>
                <option value='deepseek'>DeepSeek</option>
                <option value='custom'>Custom / Self-Hosted</option>
              </select>
            </div>

            <div className='sm:col-span-2'>
              <label htmlFor='ai-baseurl' className={fieldLabel}>
                API base URL
              </label>
              <input
                id='ai-baseurl'
                type='url'
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder='https://api.openai.com/v1'
                className={inputClass}
                required
              />
            </div>

            <div className='sm:col-span-2'>
              <div className='mb-1.5 flex items-center justify-between gap-2'>
                <label htmlFor='ai-key' className='flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted'>
                  API key
                  {hasApiKey && <StatusPill tone='success'>{maskedApiKey}</StatusPill>}
                </label>
                <span className='text-[10px] text-ink-subtle'>
                  {hasApiKey ? 'Leave blank to keep existing key' : 'Required'}
                </span>
              </div>
              <div className='relative'>
                <input
                  id='ai-key'
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasApiKey ? '••••••••••••••••••••••••••••••••' : 'Enter secret key (sk-…)'}
                  className={`${inputClass} pl-2.5 pr-8`}
                />
                <button
                  type='button'
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-subtle transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
                >
                  {showKey ? <EyeOff className='h-3.5 w-3.5' /> : <Eye className='h-3.5 w-3.5' />}
                </button>
              </div>
            </div>

            <div className='sm:col-span-2 space-y-2'>
              <label htmlFor='ai-model' className={fieldLabel}>
                Model identifier
              </label>
              <input
                id='ai-model'
                type='text'
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder='e.g. qwen/qwen3.8-27b, gpt-4o-mini, or nvidia/nemotron-3-ultra:free'
                className={inputClass}
                required
              />

              {currentPreset?.suggestedModels && currentPreset.suggestedModels.length > 0 && (
                <>
                  <div className='flex flex-wrap items-center gap-1.5 pt-0.5'>
                    <span className='mr-0.5 text-[11px] font-semibold text-ink-muted'>Quick select</span>
                    {currentPreset.suggestedModels.map((item) => {
                      const spec: AIModelSpec =
                        typeof item === 'string'
                          ? { slug: item, free: item.includes(':free') || item.endsWith('/free') }
                          : item;
                      const isSelected = model === spec.slug;
                      return (
                        <button
                          key={spec.slug}
                          type='button'
                          aria-pressed={isSelected}
                          onClick={() => {
                            setModel(spec.slug);
                            if (spec.recommendedTokens) setMaxTokens(spec.recommendedTokens);
                            if (spec.recommendedTemp !== undefined) setTemperature(spec.recommendedTemp);
                          }}
                          className={`${pillBase} font-mono ${
                            isSelected
                              ? 'border-hairline-strong bg-ink font-semibold text-panel'
                              : 'border-hairline bg-panel text-ink-muted hover:bg-panel-subtle hover:text-ink'
                          }`}
                        >
                          {spec.free && (
                            <span className='rounded border border-success-200 bg-success-50 px-1 text-[9px] font-semibold uppercase tracking-wider text-success-700'>
                              Free
                            </span>
                          )}
                          {spec.label || spec.slug}
                        </button>
                      );
                    })}
                  </div>

                  {activeModelSpec && (
                    <div className='flex items-start gap-2.5 rounded border border-info-200 bg-info-50 px-3 py-2.5'>
                      <Bot className='mt-0.5 h-4 w-4 shrink-0 text-info-600' aria-hidden='true' />
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='text-xs font-semibold text-ink'>
                            {activeModelSpec.label || activeModelSpec.slug}
                          </span>
                          {activeModelSpec.badge && (
                            <span className='rounded border border-success-200 bg-success-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success-700'>
                              {activeModelSpec.badge}
                            </span>
                          )}
                          {activeModelSpec.recommendedTokens && (
                            <span className='font-mono text-[10px] text-ink-muted'>
                              Optimal: {activeModelSpec.recommendedTokens} tokens · temp{' '}
                              {activeModelSpec.recommendedTemp}
                            </span>
                          )}
                        </div>
                        {activeModelSpec.description && (
                          <p className='mt-1 text-[11px] leading-relaxed text-ink-muted'>
                            {activeModelSpec.description}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className='p-3'>
            <button
              type='button'
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              className='flex items-center gap-1.5 rounded text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none'
            >
              {showAdvanced ? (
                <ChevronUp className='h-3.5 w-3.5' aria-hidden='true' />
              ) : (
                <ChevronDown className='h-3.5 w-3.5' aria-hidden='true' />
              )}
              {showAdvanced ? 'Hide advanced parameters' : 'Advanced parameters (temperature & tokens)'}
            </button>

            {showAdvanced && (
              <div className='mt-2 grid grid-cols-1 gap-4 rounded border border-hairline bg-panel-subtle p-3 sm:grid-cols-2'>
                <div>
                  <div className='mb-2 flex items-center justify-between gap-2'>
                    <label htmlFor='ai-temp' className={inlineFieldLabel}>
                      Temperature{' '}
                      <span className='font-mono text-ink'>{temperature}</span>
                    </label>
                    <span className='text-[10px] text-ink-subtle'>0.3 is optimal for tax logic</span>
                  </div>
                  <input
                    id='ai-temp'
                    type='range'
                    min='0.0'
                    max='1.0'
                    step='0.05'
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className='w-full cursor-pointer accent-primary-600'
                  />
                </div>

                <div>
                  <label htmlFor='ai-tokens' className={fieldLabel}>
                    Max output tokens
                  </label>
                  <input
                    id='ai-tokens'
                    type='number'
                    min='100'
                    max='4096'
                    step='64'
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1024)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          {testResult?.tested && (
            <div
              role='status'
              aria-live='polite'
              className={`flex items-start gap-2.5 px-3 py-2.5 ${
                testResult.success
                  ? 'border-y border-success-200 bg-success-50'
                  : 'border-y border-danger-200 bg-danger-50'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className='mt-0.5 h-4 w-4 shrink-0 text-success-600' aria-hidden='true' />
              ) : (
                <AlertCircle className='mt-0.5 h-4 w-4 shrink-0 text-danger-600' aria-hidden='true' />
              )}
              <div className='min-w-0 flex-1 space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span
                    className={`text-xs font-semibold ${
                      testResult.success ? 'text-success-700' : 'text-danger-700'
                    }`}
                  >
                    {testResult.success ? 'Connection verified' : 'Connection failed'}
                  </span>
                  {testResult.latencyMs !== undefined && (
                    <span className='font-mono text-[10px] text-success-700'>{testResult.latencyMs}ms</span>
                  )}
                </div>
                <p className='break-words font-mono text-[11px] leading-relaxed text-ink-muted'>
                  {testResult.success ? `Response: "${testResult.reply}"` : testResult.error}
                </p>
              </div>
            </div>
          )}

          <div className='flex flex-col items-stretch justify-between gap-2 p-3 sm:flex-row sm:items-center'>
            <div className='flex items-center gap-3'>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={handleTestConnection}
                disabled={testing || loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
                {testing ? 'Testing endpoint…' : 'Test Connection'}
              </Button>
              {updatedAt && (
                <span className='hidden text-[11px] text-ink-subtle sm:inline'>
                  Updated {formatStamp(updatedAt)}
                </span>
              )}
            </div>

            <Button type='submit' size='sm' disabled={saving || loading} isLoading={saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </Button>
          </div>
        </Panel>
      </form>
    </div>
  );
}
