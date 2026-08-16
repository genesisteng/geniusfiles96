/**
 * Google Analytics for Firebase — base de mesure GeniusFiles.
 *
 * Ce module ne mesure QUE l'usage global de l'application :
 *  - vues d'écran (nom LOGIQUE issu d'une liste blanche de routes) ;
 *  - langue d'interface et version de l'application (propriétés courtes).
 *
 * Sessions, versions d'app, modèle d'appareil, version d'Android, langue
 * système et pays sont collectés automatiquement par le SDK Firebase :
 * aucun code applicatif n'est nécessaire et aucune donnée supplémentaire
 * n'est envoyée depuis la WebView.
 *
 * Jamais transmis : contenu, nom ou chemin de fichier, données du coffre-
 * fort, code PIN / mot de passe, messages ou prompts Genius AI, contenu de
 * document / photo / vidéo / audio, identifiant utilisateur ou toute donnée
 * permettant d'identifier une personne. Aucun paramètre libre n'est accepté
 * par le pont natif.
 *
 * Hors runtime Android natif (web, SSR, aperçu Lovable) : entièrement no-op.
 */
import { isNativeRuntime, nativePlatform } from "./platform";

type AnalyticsBridge = {
  logScreenView(options: { screen: string }): Promise<void>;
  setUserProperty(options: { name: string; value: string }): Promise<void>;
  setEnabled(options: { enabled: boolean }): Promise<void>;
  isAvailable(): Promise<{ available: boolean }>;
};

let bridge: AnalyticsBridge | null | undefined;

function plugin(): AnalyticsBridge | null {
  if (bridge !== undefined) return bridge;
  if (!isNativeRuntime() || nativePlatform() !== "android") {
    bridge = null;
    return null;
  }
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  bridge = (plugins?.["GeniusFilesAnalytics"] as AnalyticsBridge | undefined) ?? null;
  return bridge;
}

/**
 * Liste blanche des écrans. Toute route inconnue est agrégée sous `autre` :
 * il est donc impossible qu'un identifiant, un nom de fichier ou un chemin
 * se retrouve dans un nom d'écran.
 */
const SCREENS = new Set([
  "accueil",
  "applications",
  "assistant",
  "automatisations",
  "categorie",
  "coffre-fort",
  "corbeille",
  "editeur-audio",
  "fichiers-recents",
  "nettoyeur",
  "organisation",
  "parametres",
  "pdf-outils",
  "recherche",
]);

/** Nom d'écran logique (jamais de segment dynamique, jamais de chemin). */
export function screenName(pathname: string): string {
  const first = (pathname.split("/").filter(Boolean)[0] ?? "accueil").toLowerCase();
  if (first === "accueil" || first === "") return "accueil";
  const base = first.split(".")[0] ?? first;
  return SCREENS.has(base) ? base : "autre";
}

let lastScreen: string | null = null;

/** Vue d'écran (dédupliquée : aucun envoi redondant). */
export function trackScreen(pathname: string): void {
  const p = plugin();
  if (!p) return;
  const screen = screenName(pathname);
  if (screen === lastScreen) return;
  lastScreen = screen;
  void p.logScreenView({ screen }).catch(() => {});
}

let installed = false;

/**
 * Initialise la mesure : deux propriétés techniques + l'écran courant.
 * Aucun minuteur, aucune I/O, aucun écouteur permanent : coût négligeable.
 */
export function installAnalytics(): void {
  if (installed || typeof window === "undefined") return;
  const p = plugin();
  if (!p) return;
  installed = true;

  const language = (navigator.language || "unknown").slice(0, 12).replace(/[^\w-]/g, "");
  void p.setUserProperty({ name: "app_language", value: language }).catch(() => {});
  void p.setUserProperty({ name: "app_version", value: __APP_VERSION__ }).catch(() => {});
  trackScreen(window.location.pathname);
}
