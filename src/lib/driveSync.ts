import { backupFileName, buildBackup, normalizeBackupPayload, restoreBackup } from "./backup";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const LAST_SYNC_KEY = "google_drive_last_sync";
const TOKEN_KEY = "google_drive_access_token";
const TOKEN_EXPIRY_KEY = "google_drive_access_token_expiry";
const DRIVE_FILE_NAME = "food-coach-backup.json";
const DRIVE_FOLDER_NAME = "Food Coach Backups";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const IDENTITY_URL = "https://accounts.google.com/gsi/client";
const BASE_URL = (import.meta as any)?.env?.BASE_URL ?? "/";
const LOCAL_IDENTITY_URL = `${BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`}gsi-client.js`;
// Default client ID used for Android build (set via env for web/other targets)
const DEFAULT_CLIENT_ID =
  (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)
    ? "130912411880-5s9mg4lpdgiteefgulf26mv37cv7cmmj.apps.googleusercontent.com"
    : "130912411880-u34hui50kge8g4kjvc7m88slfsoutrj5.apps.googleusercontent.com");

declare global {
  interface Window {
    google?: any;
  }
}

class AuthError extends Error {}

let tokenClient: any = null;
let cachedAccessToken: string | null = null;
let cachedExpiry: number | null = null;
let tokenPromise: Promise<string> | null = null;
const DRIVE_TIMEOUT_MS = 20_000;

function getStoredClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID || "";
}

export function getDriveClientId() {
  return getStoredClientId();
}

export function getLastDriveSync() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_SYNC_KEY);
}

function loadStoredToken() {
  if (typeof localStorage === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
  const expiry = expiryStr ? Number(expiryStr) : null;
  if (!token || !expiry) return null;
  return { token, expiry };
}

function persistToken(token: string, expiresInSeconds?: number) {
  const expiresAt = Date.now() + (expiresInSeconds ? expiresInSeconds * 1000 : 55 * 60 * 1000);
  cachedAccessToken = token;
  cachedExpiry = expiresAt;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DRIVE_TIMEOUT_MS);
  return promise
    .finally(() => clearTimeout(timer))
    .catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`${label} timed out. Check connectivity/Google access.`);
      }
      throw err;
    });
}

async function fetchWithTimeout(url: string, init: RequestInit, label: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DRIVE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`${label} timed out. Check connectivity/Google access.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function loadIdentityScript(): Promise<void> {
  if (typeof window === "undefined") throw new Error("Drive auth is only available in the browser.");
  if (window.google?.accounts?.oauth2) return;

  const existing = document.querySelector<HTMLScriptElement>("script[data-google-identity]");
  if (existing) {
    // If a previous attempt failed, remove and retry
    if (!window.google?.accounts?.oauth2) {
      existing.remove();
    } else {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity script")), { once: true });
        }),
        "Google Identity script load"
      );
      return;
    }
  }

  const injectScript = (src: string, label: string) =>
    withTimeout(
      new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.defer = true;
        script.dataset.googleIdentity = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`${label} failed to load`));
        document.head.appendChild(script);
      }),
      label
    );

  // 1) Local bundled script tag (prefer to avoid network flakiness)
  try {
    await injectScript(LOCAL_IDENTITY_URL, "Local Google Identity script");
    return;
  } catch (err) {
    console.error("Local Google Identity load failed", err);
  }

  // 2) Remote script tag
  try {
    await injectScript(IDENTITY_URL, "Google Identity script");
    return;
  } catch (err) {
    console.error("Primary Google Identity load failed", err);
  }

  // 3) Remote fetch + inline blob (if script tags are blocked but fetch works)
  try {
    const res = await fetchWithTimeout(IDENTITY_URL, {}, "Google Identity fetch");
    if (!res.ok) throw new Error(`Google Identity fetch HTTP ${res.status}`);
    const text = await res.text();
    const blobUrl = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    try {
      await injectScript(blobUrl, "Google Identity inline");
      return;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (err) {
    console.error("Inline Google Identity fallback failed", err);
  }

  // 4) Local fetch + inline blob (last resort)
  try {
    const res = await fetchWithTimeout(LOCAL_IDENTITY_URL, {}, "Local Google Identity fetch");
    if (!res.ok) throw new Error(`Local Google Identity fetch HTTP ${res.status}`);
    const text = await res.text();
    const blobUrl = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    try {
      await injectScript(blobUrl, "Local Google Identity inline");
      return;
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (err) {
    console.error("Local inline Google Identity fallback failed", err);
    throw new Error(`Failed to load Google Identity script: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function getAccessToken(opts: { forcePrompt?: boolean } = {}): Promise<string> {
  if (!opts.forcePrompt) {
    const now = Date.now();
    if (cachedAccessToken && cachedExpiry && cachedExpiry - now > 30_000) {
      return cachedAccessToken;
    }
    const stored = loadStoredToken();
    if (stored && stored.expiry - now > 30_000) {
      cachedAccessToken = stored.token;
      cachedExpiry = stored.expiry;
      return stored.token;
    }
  }
  if (tokenPromise) return tokenPromise;

  const pending = new Promise<string>(async (resolve, reject) => {
    try {
      await loadIdentityScript();
      const clientId = getStoredClientId();
      if (!clientId) throw new Error("Google Drive client ID not configured.");
      const google = window.google;
      if (!google?.accounts?.oauth2) throw new Error("Google Identity Services unavailable.");

      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          prompt: "",
          callback: () => {},
        });
      }

      tokenClient.callback = (resp: { access_token?: string; error?: string; expires_in?: number }) => {
        tokenPromise = null;
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "Failed to acquire Drive token"));
          return;
        }
        persistToken(resp.access_token, resp.expires_in);
        resolve(resp.access_token);
      };

      tokenClient.requestAccessToken({
        prompt: opts.forcePrompt ? "consent" : "",
      });
    } catch (err) {
      tokenPromise = null;
      reject(err);
    }
  });

  tokenPromise = pending;
  return withTimeout(pending, "Google token request").catch((err) => {
    tokenPromise = null;
    throw err;
  });
}

function withAuthHeader(token: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

async function findExistingBackupFile(token: string, folderId: string) {
  const params = new URLSearchParams({
    fields: "files(id,name,modifiedTime,size,parents)",
    orderBy: "modifiedTime desc",
    pageSize: "1",
    q: `name='${DRIVE_FILE_NAME}' and trashed=false and '${folderId}' in parents`,
  });
  const res = await fetchWithTimeout(
    `${DRIVE_API}/files?${params.toString()}`,
    withAuthHeader(token),
    "Drive list"
  );
  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
  const data = await res.json();
  return (data.files?.[0] as { id: string; modifiedTime?: string } | undefined) ?? null;
}

async function ensureBackupFolder(token: string): Promise<string> {
  const params = new URLSearchParams({
    fields: "files(id,name)",
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    pageSize: "1",
  });
  const res = await fetchWithTimeout(
    `${DRIVE_API}/files?${params.toString()}`,
    withAuthHeader(token),
    "Drive folder lookup"
  );
  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) throw new Error(`Drive folder lookup failed: ${await res.text()}`);
  const data = await res.json();
  const existing = data.files?.[0] as { id: string } | undefined;
  if (existing?.id) return existing.id;

  const createRes = await fetchWithTimeout(
    `${DRIVE_API}/files`,
    withAuthHeader(token, {
      method: "POST",
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      }),
      headers: { "Content-Type": "application/json" },
    })
  );
  if (createRes.status === 401) throw new AuthError("Unauthorized");
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${await createRes.text()}`);
  const created = await createRes.json();
  return created.id as string;
}

function buildMultipartBody(metadata: object, json: object) {
  const boundary = `foodcoach-${crypto.randomUUID()}`;
  const delimiter = `--${boundary}`;
  const closeDelimiter = `--${boundary}--`;

  const body = [
    delimiter,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    delimiter,
    "Content-Type: application/json",
    "",
    JSON.stringify(json),
    closeDelimiter,
    "",
  ].join("\r\n");

  return { body, boundary };
}

async function uploadWithToken(token: string) {
  const backup = await buildBackup();
  const folderId = await ensureBackupFolder(token);
  const existing = await findExistingBackupFile(token, folderId);
  const metadata = existing ? { name: DRIVE_FILE_NAME } : { name: DRIVE_FILE_NAME, parents: [folderId] };
  const { body, boundary } = buildMultipartBody(metadata, backup);
  const url = existing
    ? `${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;
  const method = existing ? "PATCH" : "POST";

  const res = await fetchWithTimeout(
    url,
    withAuthHeader(token, {
      method,
      body,
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
    })
  );

  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) throw new Error(`Drive upload failed: ${await res.text()}`);

  const data = await res.json();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LAST_SYNC_KEY, data.modifiedTime ?? new Date().toISOString());
  }

  return { fileId: data.id as string, modifiedTime: data.modifiedTime as string | undefined, backup };
}

async function downloadWithToken(token: string) {
  const folderId = await ensureBackupFolder(token);
  const file = await findExistingBackupFile(token, folderId);
  if (!file) throw new Error("No Drive backup found. Run a sync first.");

  const res = await fetchWithTimeout(
    `${DRIVE_API}/files/${file.id}?alt=media`,
    withAuthHeader(token),
    "Drive download"
  );
  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) throw new Error(`Drive download failed: ${await res.text()}`);
  const json = await res.json();
  return normalizeBackupPayload(json);
}

function isAuthError(err: unknown) {
  return err instanceof AuthError;
}

export async function syncBackupToDrive(opts: { promptUser?: boolean } = {}) {
  const firstToken = await getAccessToken(opts.promptUser ? { forcePrompt: true } : {});
  try {
    return await uploadWithToken(firstToken);
  } catch (err) {
    if (isAuthError(err) && !opts.promptUser) {
      const token = await getAccessToken({ forcePrompt: true });
      return await uploadWithToken(token);
    }
    throw err;
  }
}

export async function downloadBackupFromDrive(opts: { promptUser?: boolean } = {}) {
  const firstToken = await getAccessToken(opts.promptUser ? { forcePrompt: true } : {});
  try {
    return await downloadWithToken(firstToken);
  } catch (err) {
    if (isAuthError(err) && !opts.promptUser) {
      const token = await getAccessToken({ forcePrompt: true });
      return await downloadWithToken(token);
    }
    throw err;
  }
}

export async function importBackupFromDrive(opts: { promptUser?: boolean } = {}) {
  const payload = await downloadBackupFromDrive(opts);
  await restoreBackup(payload);
  return payload;
}

export function driveBackupFilename() {
  return backupFileName();
}
