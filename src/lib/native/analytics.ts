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
  logEvent(options: { name: string; params?: Record<string, string>; count?: number }): Promise<void>;
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
  trackEvent("app_open");
}

/* ────────────────────────────────────────────────────────────────
   Événements de fonctionnalités

   Un nombre volontairement restreint d'événements « génériques »
   qualifiés par des paramètres en liste blanche : on sait quelles
   fonctionnalités sont utilisées, lesquelles échouent, et quels outils
   sont populaires — sans jamais transmettre de contenu utilisateur.

   Ne peuvent JAMAIS transiter ici : nom ou chemin de fichier, contenu,
   requête de recherche, texte Genius AI, PIN, données du coffre-fort.
   Les valeurs sont normalisées (a-z, 0-9, `_`, 32 caractères max) et les
   clés refusées si elles ne figurent pas dans la liste blanche.
   ──────────────────────────────────────────────────────────────── */

/** Événements autorisés — toute autre valeur est ignorée. */
const EVENTS = new Set([
  "app_open",
  "feature_open",
  "search_run",
  "file_open",
  "file_action",
  "trash_action",
  "vault_action",
  "pdf_tool",
  "media_edit",
  "ai_usage",
  "automation",
]);

export type AnalyticsEvent =
  | "app_open"
  | "feature_open"
  | "search_run"
  | "file_open"
  | "file_action"
  | "trash_action"
  | "vault_action"
  | "pdf_tool"
  | "media_edit"
  | "ai_usage"
  | "automation";

export type AnalyticsResult = "success" | "failure" | "cancelled" | "partial";

export type AnalyticsParams = {
  /** Action générique (copy, move, rename, delete, share…). */
  action?: string;
  /** Outil ou module (merge, compress, vault, photo_editor…). */
  tool?: string;
  /** Type générique de contenu (image, video, audio, document, folder…). */
  kind?: string;
  /** Issue de l'opération. */
  result?: AnalyticsResult;
  /** Nombre d'éléments — arrondi en paliers, jamais une valeur exacte. */
  count?: number;
};

/** Jeton court et neutre : impossible d'y loger un nom ou un chemin. */
function token(value: string | undefined): string | null {
  if (!value) return null;
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean ? clean.slice(0, 32) : null;
}

/** Paliers : 1, 2, 5, 10, 25, 50, 100, 500, 1000 — jamais l'effectif exact. */
function bucket(n: number): number {
  const steps = [1, 2, 5, 10, 25, 50, 100, 500, 1000];
  let last = 0;
  for (const s of steps) {
    if (n < s) return last;
    last = s;
  }
  return 1000;
}

/**
 * Enregistre un événement de fonctionnalité. No-op hors Android natif ;
 * appel asynchrone non bloquant, aucune I/O côté WebView.
 */
export function trackEvent(name: AnalyticsEvent, params: AnalyticsParams = {}): void {
  const p = plugin();
  if (!p || !EVENTS.has(name)) return;
  const out: Record<string, string> = {};
  const action = token(params.action);
  const tool = token(params.tool);
  const kind = token(params.kind);
  const result = token(params.result);
  if (action) out["action"] = action;
  if (tool) out["tool"] = tool;
  if (kind) out["kind"] = kind;
  if (result) out["result"] = result;
  const count = typeof params.count === "number" && params.count > 0 ? bucket(params.count) : undefined;
  void p.logEvent({ name, params: out, count }).catch(() => {});
}

/** Raccourci : issue d'une opération de fichiers (succès / échec partiel). */
export function trackFileAction(
  action: string,
  outcome: { ok: boolean; succeeded?: number; failed?: number; cancelled?: boolean },
): void {
  const result: AnalyticsResult = outcome.cancelled
    ? "cancelled"
    : outcome.ok
      ? "success"
      : (outcome.succeeded ?? 0) > 0
        ? "partial"
        : "failure";
  trackEvent("file_action", { action, result, count: outcome.succeeded ?? 0 });
}
