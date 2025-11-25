import { backupFileName, buildBackup, normalizeBackupPayload, restoreBackup } from "./backup";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const CLIENT_ID_KEY = "google_drive_client_id";
const LAST_SYNC_KEY = "google_drive_last_sync";
const DRIVE_FILE_NAME = "food-coach-backup.json";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

declare global {
  interface Window {
    google?: any;
  }
}

class AuthError extends Error {}

let tokenClient: any = null;
let cachedAccessToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

function getStoredClientId() {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(CLIENT_ID_KEY) : "";
  return saved || import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
}

export function saveDriveClientId(id: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CLIENT_ID_KEY, id.trim());
}

export function getDriveClientId() {
  return getStoredClientId();
}

export function getLastDriveSync() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LAST_SYNC_KEY);
}

async function loadIdentityScript(): Promise<void> {
  if (typeof window === "undefined") throw new Error("Drive auth is only available in the browser.");
  if (window.google?.accounts?.oauth2) return;

  const existing = document.querySelector<HTMLScriptElement>("script[data-google-identity]");
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity script")), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script"));
    document.head.appendChild(script);
  });
}

async function getAccessToken(opts: { forcePrompt?: boolean } = {}): Promise<string> {
  if (cachedAccessToken && !opts.forcePrompt) {
    return cachedAccessToken;
  }
  if (tokenPromise) return tokenPromise;

  tokenPromise = new Promise<string>(async (resolve, reject) => {
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

      tokenClient.callback = (resp: { access_token?: string; error?: string }) => {
        tokenPromise = null;
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "Failed to acquire Drive token"));
          return;
        }
        cachedAccessToken = resp.access_token;
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

  return tokenPromise;
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

async function findExistingBackupFile(token: string) {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id,name,modifiedTime,size)",
    orderBy: "modifiedTime desc",
    pageSize: "1",
    q: `name='${DRIVE_FILE_NAME}' and trashed=false and 'appDataFolder' in parents`,
  });
  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, withAuthHeader(token));
  if (res.status === 401) throw new AuthError("Unauthorized");
  if (!res.ok) throw new Error(`Drive list failed: ${await res.text()}`);
  const data = await res.json();
  return (data.files?.[0] as { id: string; modifiedTime?: string } | undefined) ?? null;
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
  const metadata = { name: DRIVE_FILE_NAME, parents: ["appDataFolder"] };
  const existing = await findExistingBackupFile(token);
  const { body, boundary } = buildMultipartBody(metadata, backup);
  const url = existing
    ? `${DRIVE_UPLOAD_API}/files/${existing.id}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;
  const method = existing ? "PATCH" : "POST";

  const res = await fetch(
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
  const file = await findExistingBackupFile(token);
  if (!file) throw new Error("No Drive backup found. Run a sync first.");

  const res = await fetch(`${DRIVE_API}/files/${file.id}?alt=media`, withAuthHeader(token));
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
