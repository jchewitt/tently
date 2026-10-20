import { expect, it, vi } from 'vitest';
import { prepareCodexAuthentication } from './codex-auth.js';

it('defaults to ChatGPT and excludes ambient API credentials and endpoint overrides', async () => {
  const probe = vi.fn(async () => 'chatgpt' as const);
  const environment = await prepareCodexAuthentication(undefined, {
    PATH: '/tools', CODEX_HOME: '/codex', HTTPS_PROXY: 'http://proxy',
    OPENAI_API_KEY: 'ambient-key', CODEX_API_KEY: 'ambient-key', OPENAI_BASE_URL: 'https://other.invalid',
  }, 'codex', {}, probe);
  expect(environment).toEqual({ PATH: '/tools', CODEX_HOME: '/codex', HTTPS_PROXY: 'http://proxy' });
  expect(probe).toHaveBeenCalledOnce();
});

it.each(['api-key', 'unknown', 'unavailable'] as const)('rejects %s login in ChatGPT mode', async mode => {
  await expect(prepareCodexAuthentication({ mode: 'chatgpt' }, { CODEX_API_KEY: 'ambient-key' },
    'codex', {}, async () => mode)).rejects.toThrow('no API fallback');
});

it('passes only the selected key to Codex without consulting saved login', async () => {
  const probe = vi.fn();
  const environment = await prepareCodexAuthentication({ mode: 'api-key', apiKeyEnv: 'TENTLY_TEST_KEY' },
    { TENTLY_TEST_KEY: 'selected-key', CODEX_API_KEY: 'other-key', OPENAI_API_KEY: 'other-key' }, 'codex', {}, probe);
  expect(environment).toEqual({ CODEX_API_KEY: 'selected-key' });
  expect(probe).not.toHaveBeenCalled();
});

it('uses CODEX_API_KEY by default in API mode and never falls back when it is missing', async () => {
  expect(await prepareCodexAuthentication({ mode: 'api-key' }, { CODEX_API_KEY: 'selected-key' }, 'codex'))
    .toEqual({ CODEX_API_KEY: 'selected-key' });
  const probe = vi.fn();
  await expect(prepareCodexAuthentication({ mode: 'api-key' }, { OPENAI_API_KEY: 'other-key' }, 'codex', {}, probe))
    .rejects.toThrow('CODEX_API_KEY');
  expect(probe).not.toHaveBeenCalled();
});
