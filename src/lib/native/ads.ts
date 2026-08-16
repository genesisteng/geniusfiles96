/**
 * Annonces natives avancées (Google Mobile Ads) — pont WebView ⇄ Android.
 *
 * Le rendu des éléments de l'annonce reste 100 % natif (`NativeAdView`),
 * conformément aux règles AdMob pour le format natif : la WebView ne fait
 * que réserver un emplacement et publier sa position à l'écran.
 *
 * Confidentialité : aucune donnée applicative n'est transmise — ni nom, ni
 * chemin, ni contenu de fichier, ni donnée du coffre-fort, ni message
 * Genius AI. Le pont n'échange que des coordonnées et un identifiant
 * d'emplacement.
 *
 * Hors runtime Android (web, SSR, aperçu Lovable) tout est no-op.
 */
import { isNativeRuntime, nativePlatform } from "./platform";

/** Bloc « Natif avancé » GeniusFiles. Le natif bascule seul sur l'ID de
 *  test Google dans les builds debug : aucune impression réelle en test. */
export const NATIVE_AD_UNIT_ID = "ca-app-pub-4007496300800778/7344875182";

export type AdRect = { x: number; y: number; width: number; height: number };

type AdsBridge = {
  isAvailable(): Promise<{ available: boolean }>;
  initialize(): Promise<void>;
  show(options: { id: string; adUnitId: string } & AdRect): Promise<void>;
  hide(options: { id: string }): Promise<void>;
  destroy(options: { id: string }): Promise<void>;
};

let bridge: AdsBridge | null = null;

function plugin(): AdsBridge | null {
  if (bridge) return bridge;
  if (!isNativeRuntime() || nativePlatform() !== "android") return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  const found = plugins?.["GeniusFilesAds"] as AdsBridge | undefined;
  bridge = found ?? null;
  return bridge;
}

/** Les annonces ne sont disponibles que dans l'APK Android. */
export function areAdsAvailable(): boolean {
  return plugin() != null;
}

/** Prépare le SDK au démarrage (initialisation en tâche de fond côté natif). */
export function initAds(): void {
  void plugin()
    ?.initialize()
    .catch(() => undefined);
}

/** Positionne (et charge au besoin) l'annonce de l'emplacement donné. */
export function showAd(id: string, rect: AdRect): void {
  void plugin()
    ?.show({ id, adUnitId: NATIVE_AD_UNIT_ID, ...rect })
    .catch(() => undefined);
}

/** Masque l'emplacement sans détruire l'annonce déjà chargée. */
export function hideAd(id: string): void {
  void plugin()
    ?.hide({ id })
    .catch(() => undefined);
}

/** Libère l'annonce et retire la vue native (démontage de l'écran). */
export function destroyAd(id: string): void {
  void plugin()
    ?.destroy({ id })
    .catch(() => undefined);
}
