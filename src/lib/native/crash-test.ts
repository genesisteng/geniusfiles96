/**
 * ⚠️ TEMPORAIRE — VALIDATION CRASHLYTICS UNIQUEMENT. À SUPPRIMER.
 *
 * Pont vers le greffon natif `GeniusFilesCrashTest`. Rien n'est déclenché
 * automatiquement : ces fonctions ne s'exécutent que sur action explicite
 * de l'utilisateur depuis la carte « Diagnostic Crashlytics » des
 * Paramètres. Aucune donnée personnelle n'est transmise.
 *
 * Suppression : supprimer ce fichier, la carte des Paramètres et le
 * greffon natif `GeniusFilesCrashTestPlugin.kt`.
 */
import { isNativeRuntime, nativePlatform } from "./platform";

type CrashTestBridge = {
  recordTestNonFatal(): Promise<{ ok: boolean }>;
  crashNow(): Promise<void>;
};

function bridge(): CrashTestBridge | null {
  if (!isNativeRuntime() || nativePlatform() !== "android") return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  return (plugins?.["GeniusFilesCrashTest"] as CrashTestBridge | undefined) ?? null;
}

/** Vrai uniquement dans l'APK Android où le greffon de test est présent. */
export function isCrashTestAvailable(): boolean {
  return bridge() !== null;
}

/** Erreur non fatale de test → visible dans Crashlytics sous quelques minutes. */
export async function sendTestNonFatal(): Promise<boolean> {
  const plugin = bridge();
  if (!plugin) return false;
  try {
    await plugin.recordTestNonFatal();
    return true;
  } catch {
    return false;
  }
}

/** Crash natif réel : l'application se ferme immédiatement (attendu). */
export async function triggerTestCrash(): Promise<boolean> {
  const plugin = bridge();
  if (!plugin) return false;
  try {
    await plugin.crashNow();
    return true;
  } catch {
    return false;
  }
}
