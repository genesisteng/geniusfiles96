/**
 * Google Mobile Ads (GMA Next-Gen SDK) — pont WebView de GeniusFiles.
 *
 * Sur le web (aperçu Lovable / SSR) tout est no-op : aucune publicité,
 * aucune régression visuelle. Dans l'APK, les appels sont délégués au
 * plugin natif `GeniusFilesAds`.
 *
 * Aucune donnée personnelle (nom de fichier, chemin, contenu, coffre-fort)
 * n'est transmise au SDK publicitaire.
 */
import { isNativeRuntime, nativePlatform } from "./platform";

/** Identifiant d'application AdMob de GeniusFiles (référence, côté natif). */
export const ADMOB_APP_ID = "ca-app-pub-4007496300800778~9248149643";

/** Bloc d'annonces de TEST Google — à remplacer par le bloc réel en production. */
export const TEST_BANNER_AD_UNIT_ID = "ca-app-pub-3940256099942544/9214589741";

type AdsBridge = {
  initialize(): Promise<{ initialized: boolean }>;
  showBanner(options: { adUnitId?: string; widthDp?: number }): Promise<{ shown: boolean }>;
  hideBanner(): Promise<{ shown: boolean }>;
};

let bridge: AdsBridge | null | undefined;

function plugin(): AdsBridge | null {
  if (bridge !== undefined) return bridge;
  if (!isNativeRuntime() || nativePlatform() !== "android") {
    bridge = null;
    return null;
  }
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  bridge = (plugins?.["GeniusFilesAds"] as AdsBridge | undefined) ?? null;
  return bridge;
}

/** Vrai quand le SDK publicitaire natif est réellement disponible. */
export function adsAvailable(): boolean {
  return plugin() !== null;
}

/** Initialise le SDK (idempotent, exécuté nativement en arrière-plan). */
export async function initializeAds(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    const result = await p.initialize();
    return result.initialized === true;
  } catch {
    return false;
  }
}

/** Affiche une bannière adaptative ancrée en bas de l'écran. */
export async function showBannerAd(
  options: { adUnitId?: string; widthDp?: number } = {},
): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try {
    const result = await p.showBanner(options);
    return result.shown === true;
  } catch {
    return false;
  }
}

/** Retire la bannière et libère ses ressources natives. */
export async function hideBannerAd(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.hideBanner();
  } catch {
    /* bannière déjà retirée */
  }
}
