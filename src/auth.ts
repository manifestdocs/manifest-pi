import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const WORKOS_DEVICE_AUTHORIZE_URL = 'https://api.workos.com/user_management/authorize/device';
const WORKOS_AUTHENTICATE_URL = 'https://api.workos.com/user_management/authenticate';
const REFRESH_BUFFER_MS = 60_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

interface StoredAuthSession {
  accessToken: string;
  refreshToken: string | null;
  clientId: string;
  expiresAt: number;
}

interface AuthClaims {
  org_id?: string;
  sub?: string;
  role?: string;
  permissions?: unknown;
}

export type AuthSource = 'env-access-token' | 'stored-session' | 'local-api-key' | 'none';

export interface AuthStatus {
  authenticated: boolean;
  source: AuthSource;
  baseUrl: string;
  isLocalBaseUrl: boolean;
  userId: string | null;
  orgId: string | null;
  role: string | null;
  permissions: string[];
  expiresAt: string | null;
}

export interface ManifestAuthManagerOptions {
  baseUrl: string;
  clientId?: string;
  accessToken?: string;
  apiKey?: string;
  storagePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface LoginCallbacks {
  onPrompt?: (prompt: {
    verificationUri: string;
    verificationUriComplete: string | null;
    userCode: string;
    expiresIn: number;
  }) => void | Promise<void>;
}

function defaultStoragePath(): string {
  return join(homedir(), '.manifest', 'auth.json');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function decodeJwtClaims(token: string): AuthClaims | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as AuthClaims;
  } catch {
    return null;
  }
}

function parseTokenResponse(body: any, fallbackRefreshToken?: string | null): TokenResponse {
  const accessToken = body?.access_token ?? body?.accessToken;
  const refreshToken = body?.refresh_token ?? body?.refreshToken ?? fallbackRefreshToken ?? null;
  const expiresIn = body?.expires_in ?? body?.expiresIn;

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('Authentication failed: missing access token.');
  }

  if (typeof expiresIn !== 'number' || Number.isNaN(expiresIn) || expiresIn <= 0) {
    throw new Error('Authentication failed: missing token expiry.');
  }

  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' && refreshToken.length > 0 ? refreshToken : null,
    expiresIn,
  };
}

function buildStatus(
  source: AuthSource,
  baseUrl: string,
  token?: string,
  expiresAt?: number | null,
): AuthStatus {
  const claims = token ? decodeJwtClaims(token) : null;
  return {
    authenticated: source !== 'none',
    source,
    baseUrl,
    isLocalBaseUrl: isLocalBaseUrl(baseUrl),
    userId: claims?.sub ?? null,
    orgId: claims?.org_id ?? null,
    role: claims?.role ?? null,
    permissions: Array.isArray(claims?.permissions)
      ? claims.permissions.filter((value): value is string => typeof value === 'string')
      : [],
    expiresAt: typeof expiresAt === 'number' ? new Date(expiresAt).toISOString() : null,
  };
}

async function readJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class ManifestAuthManager {
  private readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly accessToken?: string;
  private readonly apiKey?: string;
  private readonly storagePath: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: ManifestAuthManagerOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.clientId = options.clientId?.trim() || undefined;
    this.accessToken = options.accessToken?.trim() || undefined;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.storagePath = options.storagePath ?? defaultStoragePath();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  async getAccessToken(): Promise<string | undefined> {
    if (this.accessToken) return this.accessToken;

    const session = this.readStoredSession();
    if (session) {
      if (session.expiresAt > this.now() + REFRESH_BUFFER_MS) {
        return session.accessToken;
      }

      if (session.refreshToken && this.clientId) {
        const refreshed = await this.refreshSession(session);
        return refreshed.accessToken;
      }
    }

    if (this.apiKey && isLocalBaseUrl(this.baseUrl)) {
      return this.apiKey;
    }

    return undefined;
  }

  async getStatus(): Promise<AuthStatus> {
    if (this.accessToken) {
      return buildStatus('env-access-token', this.baseUrl, this.accessToken);
    }

    const session = this.readStoredSession();
    if (session) {
      let current = session;
      if (session.expiresAt <= this.now() + REFRESH_BUFFER_MS && session.refreshToken && this.clientId) {
        try {
          current = await this.refreshSession(session);
        } catch {
          // Keep reporting the stored session shape even if refresh fails.
        }
      }
      return buildStatus('stored-session', this.baseUrl, current.accessToken, current.expiresAt);
    }

    if (this.apiKey && isLocalBaseUrl(this.baseUrl)) {
      return buildStatus('local-api-key', this.baseUrl);
    }

    return buildStatus('none', this.baseUrl);
  }

  async login(callbacks: LoginCallbacks = {}): Promise<AuthStatus> {
    if (!this.clientId) {
      throw new Error('Missing WORKOS_CLIENT_ID for device login.');
    }

    const authorization = await this.startDeviceAuthorization(this.clientId);
    await callbacks.onPrompt?.({
      verificationUri: authorization.verification_uri,
      verificationUriComplete: authorization.verification_uri_complete ?? null,
      userCode: authorization.user_code,
      expiresIn: authorization.expires_in,
    });

    const session = await this.pollForTokens(authorization, this.clientId);
    this.writeStoredSession(session);
    return buildStatus('stored-session', this.baseUrl, session.accessToken, session.expiresAt);
  }

  logout(): boolean {
    if (!existsSync(this.storagePath)) return false;
    rmSync(this.storagePath, { force: true });
    return true;
  }

  private readStoredSession(): StoredAuthSession | null {
    if (!existsSync(this.storagePath)) return null;

    try {
      const parsed = JSON.parse(readFileSync(this.storagePath, 'utf-8')) as Partial<StoredAuthSession>;
      if (
        typeof parsed.accessToken !== 'string'
        || typeof parsed.clientId !== 'string'
        || typeof parsed.expiresAt !== 'number'
      ) {
        return null;
      }

      return {
        accessToken: parsed.accessToken,
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
        clientId: parsed.clientId,
        expiresAt: parsed.expiresAt,
      };
    } catch {
      return null;
    }
  }

  private writeStoredSession(session: StoredAuthSession): void {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(session, null, 2), { mode: 0o600 });
  }

  private async startDeviceAuthorization(clientId: string): Promise<DeviceAuthorizationResponse> {
    const response = await this.fetchImpl(WORKOS_DEVICE_AUTHORIZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    });

    const body = await readJsonSafe(response);
    if (!response.ok) {
      throw new Error(body?.error_description ?? body?.error ?? 'Unable to start device login.');
    }

    if (
      typeof body?.device_code !== 'string'
      || typeof body?.user_code !== 'string'
      || typeof body?.verification_uri !== 'string'
      || typeof body?.expires_in !== 'number'
    ) {
      throw new Error('Authentication failed: invalid device authorization response.');
    }

    return body as DeviceAuthorizationResponse;
  }

  private async pollForTokens(
    authorization: DeviceAuthorizationResponse,
    clientId: string,
  ): Promise<StoredAuthSession> {
    const startedAt = this.now();
    const deadline = startedAt + (authorization.expires_in * 1000);
    let intervalSeconds = authorization.interval ?? 5;

    while (this.now() < deadline) {
      const response = await this.fetchImpl(WORKOS_AUTHENTICATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: authorization.device_code,
          client_id: clientId,
        }),
      });

      const body = await readJsonSafe(response);
      if (response.ok) {
        const token = parseTokenResponse(body);
        return {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          clientId,
          expiresAt: this.now() + (token.expiresIn * 1000),
        };
      }

      const errorCode = typeof body?.error === 'string' ? body.error : 'unknown_error';
      if (errorCode === 'authorization_pending') {
        await this.sleep(intervalSeconds * 1000);
        continue;
      }
      if (errorCode === 'slow_down') {
        intervalSeconds += 5;
        await this.sleep(intervalSeconds * 1000);
        continue;
      }
      if (errorCode === 'access_denied') {
        throw new Error(body?.error_description ?? 'Authentication was denied.');
      }
      if (errorCode === 'expired_token') {
        throw new Error('Device login expired before authorization completed.');
      }

      throw new Error(body?.error_description ?? `Authentication failed: ${errorCode}`);
    }

    throw new Error('Device login timed out before authorization completed.');
  }

  private async refreshSession(session: StoredAuthSession): Promise<StoredAuthSession> {
    const response = await this.fetchImpl(WORKOS_AUTHENTICATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken ?? '',
        client_id: session.clientId,
      }),
    });

    const body = await readJsonSafe(response);
    if (!response.ok) {
      throw new Error(body?.error_description ?? body?.error ?? 'Unable to refresh access token.');
    }

    const token = parseTokenResponse(body, session.refreshToken);
    const refreshed = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clientId: session.clientId,
      expiresAt: this.now() + (token.expiresIn * 1000),
    };

    this.writeStoredSession(refreshed);
    return refreshed;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
