/**
 * Pont JS ↔ bannière AdMob native (GMA Next-Gen).
 *
 * La WebView ne peut pas afficher de vue native dans son flux : la bannière
 * est une `AdView` superposée, positionnée aux coordonnées CSS du bloc
 * réservé par le composant `<AdBanner />`. Hors runtime Android natif (web,
 * SSR, aperçu Lovable), tout est strictement no-op.
 *
 * Aucune donnée personnelle n'est transmise au SDK par ce module.
 */
import { isNativeRuntime, nativePlatform } from "./platform";

type AdsBridge = {
  isAvailable(): Promise<{ available: boolean }>;
  showBanner(options: {
    x: number;
    y: number;
    width: number;
    unitId?: string;
  }): Promise<{ height: number; shown: boolean }>;
  hideBanner(): Promise<void>;
  removeBanner(): Promise<void>;
};

/** Bloc de TEST officiel Google : à remplacer avant publication. */
export const TEST_BANNER_UNIT_ID = "ca-app-pub-3940256099942544/9214589741";

let bridge: AdsBridge | null = null;

function plugin(): AdsBridge | null {
  if (bridge) return bridge;
  if (!isNativeRuntime() || nativePlatform() !== "android") return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  bridge = (plugins?.["GeniusFilesAds"] as AdsBridge | undefined) ?? null;
  return bridge;
}

/** `true` uniquement dans l'APK, quand le plugin natif est enregistré. */
export function adsAvailable(): boolean {
  return plugin() !== null;
}

/** Affiche / repositionne la bannière. Renvoie la hauteur à réserver (px CSS). */
export async function showBannerAt(rect: {
  x: number;
  y: number;
  width: number;
  unitId?: string;
}): Promise<number> {
  const api = plugin();
  if (!api) return 0;
  try {
    const res = await api.showBanner({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      unitId: rect.unitId ?? TEST_BANNER_UNIT_ID,
    });
    return typeof res?.height === "number" ? res.height : 0;
  } catch {
    return 0;
  }
}

/** Masque la bannière sans détruire l'annonce chargée. */
export async function hideBanner(): Promise<void> {
  const api = plugin();
  if (!api) return;
  try {
    await api.hideBanner();
  } catch {
    /* pont indisponible */
  }
}

/** Retire la bannière et libère ses ressources natives. */
export async function removeBanner(): Promise<void> {
  const api = plugin();
  if (!api) return;
  try {
    await api.removeBanner();
  } catch {
    /* pont indisponible */
  }
}
