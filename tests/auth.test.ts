import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ManifestAuthManager } from '../src/auth.js';

function encodeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('ManifestAuthManager', () => {
  let authDir: string;
  let storagePath: string;

  beforeEach(() => {
    authDir = mkdtempSync(join(tmpdir(), 'manifest-auth-'));
    storagePath = join(authDir, 'auth.json');
  });

  afterEach(() => {
    rmSync(authDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('reports env access token claims for cloud auth', async () => {
    const token = encodeJwt({
      sub: 'user_123',
      org_id: 'org_123',
      role: 'admin',
      permissions: ['features:write'],
    });
    const auth = new ManifestAuthManager({
      baseUrl: 'https://api.manifestdocs.ai',
      accessToken: token,
      storagePath,
    });

    await expect(auth.getStatus()).resolves.toEqual({
      authenticated: true,
      source: 'env-access-token',
      baseUrl: 'https://api.manifestdocs.ai',
      isLocalBaseUrl: false,
      userId: 'user_123',
      orgId: 'org_123',
      role: 'admin',
      permissions: ['features:write'],
      expiresAt: null,
    });
  });

  it('uses local API key only for localhost targets', async () => {
    const local = new ManifestAuthManager({
      baseUrl: 'http://localhost:4242',
      apiKey: 'local-key',
      storagePath,
    });
    const remote = new ManifestAuthManager({
      baseUrl: 'https://api.manifestdocs.ai',
      apiKey: 'remote-key',
      storagePath,
    });

    await expect(local.getAccessToken()).resolves.toBe('local-key');
    await expect(remote.getAccessToken()).resolves.toBeUndefined();
  });

  it('stores a session after successful device login', async () => {
    const token = encodeJwt({ sub: 'user_abc', org_id: 'org_xyz', role: 'member' });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        device_code: 'device_123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://auth.manifestdocs.ai/device',
        verification_uri_complete: 'https://auth.manifestdocs.ai/device?user_code=ABCD-EFGH',
        expires_in: 600,
        interval: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: token,
        refresh_token: 'refresh_123',
        expires_in: 3600,
        token_type: 'Bearer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const auth = new ManifestAuthManager({
      baseUrl: 'https://api.manifestdocs.ai',
      clientId: 'client_123',
      storagePath,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 1_000_000,
    });
    const onPrompt = vi.fn();

    const status = await auth.login({ onPrompt });

    expect(onPrompt).toHaveBeenCalledWith({
      verificationUri: 'https://auth.manifestdocs.ai/device',
      verificationUriComplete: 'https://auth.manifestdocs.ai/device?user_code=ABCD-EFGH',
      userCode: 'ABCD-EFGH',
      expiresIn: 600,
    });
    expect(status.source).toBe('stored-session');
    expect(status.userId).toBe('user_abc');
    expect(status.orgId).toBe('org_xyz');
    expect(JSON.parse(readFileSync(storagePath, 'utf-8'))).toMatchObject({
      clientId: 'client_123',
      refreshToken: 'refresh_123',
    });
  });

  it('refreshes an expired stored session before using it', async () => {
    writeFileSync(storagePath, JSON.stringify({
      accessToken: 'expired-token',
      refreshToken: 'refresh_456',
      clientId: 'client_123',
      expiresAt: 1_000,
    }));

    const refreshedToken = encodeJwt({ sub: 'user_refreshed', org_id: 'org_refresh' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: refreshedToken,
      refresh_token: 'refresh_789',
      expires_in: 1800,
      token_type: 'Bearer',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const auth = new ManifestAuthManager({
      baseUrl: 'https://api.manifestdocs.ai',
      clientId: 'client_123',
      storagePath,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => 10_000,
    });

    await expect(auth.getAccessToken()).resolves.toBe(refreshedToken);
    expect(JSON.parse(readFileSync(storagePath, 'utf-8'))).toMatchObject({
      accessToken: refreshedToken,
      refreshToken: 'refresh_789',
      clientId: 'client_123',
    });
  });

  it('removes stored credentials on logout', async () => {
    writeFileSync(storagePath, JSON.stringify({
      accessToken: 'token',
      refreshToken: 'refresh',
      clientId: 'client_123',
      expiresAt: 1_000,
    }));
    const auth = new ManifestAuthManager({
      baseUrl: 'https://api.manifestdocs.ai',
      storagePath,
    });

    expect(auth.logout()).toBe(true);
    await expect(auth.getStatus()).resolves.toMatchObject({
      authenticated: false,
      source: 'none',
    });
  });
});
