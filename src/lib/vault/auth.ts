/**
 * Coffre-fort — credential storage + verification.
 *
 * PIN / password are stored as a PBKDF2-SHA256 digest with a random 16-byte
 * salt. WebCrypto is available in every runtime the app targets (Android
 * WebView, Lovable preview, SSR is guarded). We NEVER persist the plaintext.
 *
 * Biometric quick-unlock is a preference flag on top of the credential —
 * a valid PIN or password is always required as the primary factor and
 * fallback. This keeps the security model auditable: no key derives from a
 * biometric prompt alone.
 */
import type { VaultAuthMethod, VaultCredential } from "./types";
import { t } from "@/lib/i18n";

const KEY = "gf.vault.credential";
const ITERATIONS = 120_000;

function safeGet(): VaultCredential | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VaultCredential;
  } catch {
    return null;
  }
}

function safeSet(c: VaultCredential | null) {
  if (typeof window === "undefined") return;
  try {
    if (c) window.localStorage.setItem(KEY, JSON.stringify(c));
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) view[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return buf;
}

async function deriveHash(secret: string, saltHex: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

export function isVaultConfigured(): boolean {
  return safeGet() !== null;
}

export function getVaultMethod(): VaultAuthMethod | null {
  return safeGet()?.method ?? null;
}

export function isBiometricEnabled(): boolean {
  return safeGet()?.biometricEnabled ?? false;
}

/**
 * Statuts renvoyés par le pont natif `GeniusFilesBiometric`.
 *
 * Ils distinguent les vraies indisponibilités (matériel absent) des
 * situations réparables par l'utilisateur (aucune empreinte enregistrée,
 * capteur temporairement verrouillé…) afin que l'UI n'affiche plus
 * « non disponible sur cet appareil » dans tous les cas.
 */
export type BiometricStatus =
  | "available"
  | "success"
  | "none_enrolled"
  | "no_hardware"
  | "hw_unavailable"
  | "security_update_required"
  | "unsupported"
  | "lockout"
  | "cancelled"
  | "failed"
  | "web"
  | "unknown";

export type BiometricAvailability = {
  available: boolean;
  status: BiometricStatus;
  message?: string;
};

type BiometricPlugin = {
  isAvailable?: () => Promise<{ isAvailable?: boolean; status?: string; message?: string }>;
  verify?: (opts: {
    title?: string;
    reason?: string;
    cancelLabel?: string;
  }) => Promise<{ verified?: boolean; status?: string; message?: string }>;
};

function biometricPlugin(): BiometricPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor;
  return (cap?.Plugins?.GeniusFilesBiometric as BiometricPlugin | undefined) ?? null;
}

function asStatus(raw: string | undefined, fallback: BiometricStatus): BiometricStatus {
  const known: BiometricStatus[] = [
    "available",
    "success",
    "none_enrolled",
    "no_hardware",
    "hw_unavailable",
    "security_update_required",
    "unsupported",
    "lockout",
    "cancelled",
    "failed",
    "web",
    "unknown",
  ];
  return known.includes(raw as BiometricStatus) ? (raw as BiometricStatus) : fallback;
}

/** Message utilisateur adapté au statut réel du capteur. */
export function biometricStatusMessage(status: BiometricStatus): string {
  switch (status) {
    case "available":
    case "success":
      return t("vault.biometric.status.available");
    case "none_enrolled":
      return t("vault.biometric.status.none_enrolled");
    case "no_hardware":
      return t("vault.biometric.status.no_hardware");
    case "hw_unavailable":
      return t("vault.biometric.status.hw_unavailable");
    case "security_update_required":
      return t("vault.biometric.status.security_update_required");
    case "unsupported":
      return t("vault.biometric.status.unsupported");
    case "lockout":
      return t("vault.biometric.status.lockout");
    case "cancelled":
      return t("vault.biometric.status.cancelled");
    case "failed":
      return t("vault.biometric.status.failed");
    case "web":
      return t("vault.biometric.status.web");
    default:
      return t("vault.biometric.status.unknown");
  }
}

/** Sonde complète du capteur (Android). Ne lève jamais d'exception. */
export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const plugin = biometricPlugin();
  if (!plugin?.isAvailable) return { available: false, status: "web" };
  try {
    const r = await plugin.isAvailable();
    const status = asStatus(r?.status, r?.isAvailable ? "available" : "unknown");
    return {
      available: !!r?.isAvailable && status === "available",
      status,
      message: r?.message,
    };
  } catch (e) {
    return {
      available: false,
      status: "unknown",
      message: e instanceof Error ? e.message : undefined,
    };
  }
}

/** Raccourci booléen conservé pour les appels existants. */
export async function isBiometricAvailable(): Promise<boolean> {
  return (await getBiometricAvailability()).available;
}

/**
 * Lance l'invite biométrique native. Renvoie le statut détaillé pour que
 * l'appelant distingue une annulation, un verrouillage et un échec.
 */
export async function verifyBiometric(
  reason = t("vault.biometric.reason"),
): Promise<{ ok: boolean; status: BiometricStatus; message?: string }> {
  const plugin = biometricPlugin();
  if (!plugin?.verify) return { ok: false, status: "web" };
  // La temporisation anti-force brute s'applique aussi au raccourci biométrique.
  if (getVaultLockout().remainingMs > 0) return { ok: false, status: "lockout" };
  try {
    const r = await plugin.verify({
      title: "GeniusFiles",
      reason,
      cancelLabel: t("vault.biometric.useCode"),
    });
    const status = asStatus(r?.status, r?.verified ? "success" : "failed");
    return { ok: !!r?.verified, status, message: r?.message };
  } catch (e) {
    return { ok: false, status: "failed", message: e instanceof Error ? e.message : undefined };
  }
}

export async function setupVault(
  method: VaultAuthMethod,
  secret: string,
  biometricEnabled = false,
): Promise<VaultCredential> {
  const salt = randomHex(16);
  const hash = await deriveHash(secret, salt, ITERATIONS);
  const now = Date.now();
  const cred: VaultCredential = {
    method,
    hash,
    salt,
    iterations: ITERATIONS,
    biometricEnabled,
    createdAt: now,
    updatedAt: now,
  };
  safeSet(cred);
  return cred;
}

/* ---------- Anti-force brute ---------- */

const LOCKOUT_KEY = "gf.vault.lockout";
/** Tentatives tolérées avant la première temporisation. */
const FREE_ATTEMPTS = 5;
/** Palier initial, doublé à chaque échec supplémentaire. */
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

type LockoutState = { failures: number; until: number };

function readLockout(): LockoutState {
  if (typeof window === "undefined") return { failures: 0, until: 0 };
  try {
    const raw = window.localStorage.getItem(LOCKOUT_KEY);
    if (!raw) return { failures: 0, until: 0 };
    const parsed = JSON.parse(raw) as Partial<LockoutState>;
    return {
      failures: Number(parsed.failures) || 0,
      until: Number(parsed.until) || 0,
    };
  } catch {
    return { failures: 0, until: 0 };
  }
}

function writeLockout(state: LockoutState) {
  if (typeof window === "undefined") return;
  try {
    if (state.failures === 0) window.localStorage.removeItem(LOCKOUT_KEY);
    else window.localStorage.setItem(LOCKOUT_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * État de temporisation du coffre-fort. Persisté : redémarrer
 * l'application ou revenir sur l'écran ne remet pas le compteur à zéro.
 */
export function getVaultLockout(): { failures: number; remainingMs: number } {
  const state = readLockout();
  return { failures: state.failures, remainingMs: Math.max(0, state.until - Date.now()) };
}

/** Remet le compteur à zéro après un déverrouillage réussi. */
export function clearVaultLockout(): void {
  writeLockout({ failures: 0, until: 0 });
}

/** Enregistre un échec et calcule la prochaine temporisation. */
export function recordVaultFailure(): { remainingMs: number } {
  const state = readLockout();
  const failures = state.failures + 1;
  const over = failures - FREE_ATTEMPTS;
  const delay = over > 0 ? Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (over - 1)) : 0;
  const until = delay > 0 ? Date.now() + delay : 0;
  writeLockout({ failures, until });
  return { remainingMs: delay };
}

/**
 * Vérifie le code du coffre-fort.
 *
 * Une temporisation persistante et croissante s'applique au-delà de
 * cinq tentatives : la force brute d'un PIN à 4 chiffres devient
 * impraticable, y compris en relançant l'application entre deux essais.
 */
export async function verifySecret(secret: string): Promise<boolean> {
  const cred = safeGet();
  if (!cred) return false;
  if (getVaultLockout().remainingMs > 0) return false;
  const hash = await deriveHash(secret, cred.salt, cred.iterations);
  // constant-time-ish compare
  if (hash.length !== cred.hash.length) {
    recordVaultFailure();
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < hash.length; i++) {
    mismatch |= hash.charCodeAt(i) ^ cred.hash.charCodeAt(i);
  }
  if (mismatch !== 0) {
    recordVaultFailure();
    return false;
  }
  clearVaultLockout();
  return true;
}

export async function changeSecret(
  currentSecret: string,
  method: VaultAuthMethod,
  nextSecret: string,
): Promise<{ ok: boolean; error?: string }> {
  const ok = await verifySecret(currentSecret);
  if (!ok) return { ok: false, error: t("vault.auth.error.oldCode") };
  const salt = randomHex(16);
  const hash = await deriveHash(nextSecret, salt, ITERATIONS);
  const prev = safeGet();
  if (!prev) return { ok: false, error: t("vault.auth.error.notFound") };
  safeSet({
    ...prev,
    method,
    hash,
    salt,
    iterations: ITERATIONS,
    updatedAt: Date.now(),
  });
  return { ok: true };
}

export function setBiometricEnabled(enabled: boolean): void {
  const cred = safeGet();
  if (!cred) return;
  safeSet({ ...cred, biometricEnabled: enabled, updatedAt: Date.now() });
}

/**
 * Reset the credential. Only call this after the caller has verified the
 * current secret OR the user explicitly requested a hard reset (which
 * also wipes the vault contents — handled by api.ts).
 */
export function resetCredential(): void {
  safeSet(null);
  clearVaultLockout();
}
