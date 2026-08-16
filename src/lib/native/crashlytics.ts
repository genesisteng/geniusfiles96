/**
 * Surveillance de stabilité GeniusFiles (Firebase Crashlytics).
 *
 * Principe : Crashlytics capture nativement les crashs et les ANR. Ce module
 * ajoute uniquement les erreurs JavaScript non fatales importantes de la
 * WebView, après un assainissement STRICT.
 *
 * Jamais transmis : contenu de fichier, nom de fichier personnel, chemin
 * complet, contenu du coffre-fort, message ou prompt Genius AI, code PIN /
 * mot de passe / biométrie, identifiant utilisateur. Le module n'envoie que
 * des libellés techniques (type d'erreur, message assaini, pile de code de
 * l'application, route logique, version).
 *
 * Sans runtime natif (web / SSR / aperçu Lovable) tout est no-op.
 */
import { isNativeRuntime, nativePlatform } from "./platform";

type CrashlyticsBridge = {
  log(options: { message: string }): Promise<void>;
  recordError(options: { name: string; message: string; stack?: string }): Promise<void>;
  setKeys(options: { keys: Record<string, string> }): Promise<void>;
  isAvailable(): Promise<{ available: boolean }>;
};

let bridge: CrashlyticsBridge | null | undefined;

function plugin(): CrashlyticsBridge | null {
  if (bridge !== undefined) return bridge;
  if (!isNativeRuntime() || nativePlatform() !== "android") {
    bridge = null;
    return null;
  }
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor?.Plugins;
  const found = plugins?.["GeniusFilesCrashlytics"] as CrashlyticsBridge | undefined;
  bridge = found ?? null;
  return bridge;
}

/** Routes applicatives connues : seules celles-ci sont publiées comme clé. */
function safeRoute(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "accueil";
  return /^[a-z0-9-]{1,32}$/.test(first) ? first : "autre";
}

/**
 * Retire tout ce qui pourrait identifier un utilisateur ou ses documents.
 * Conserve les identifiants techniques (noms de classes, fonctions, codes).
 */
export function sanitizeDiagnostic(input: unknown, max = 240): string {
  let text = typeof input === "string" ? input : String(input ?? "");
  text = text
    // URI de contenu / fichiers Android
    .replace(/(content|file|blob):\/\/\S+/gi, "[uri]")
    // chemins absolus (≥ 2 segments)
    .replace(/(\/[\w.\-% ]+){2,}/g, "[path]")
    // adresses e-mail
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    // contenus entre guillemets (souvent un nom de fichier ou un extrait)
    .replace(/"[^"]{0,400}"/g, '"[redacted]"')
    .replace(/'[^']{0,400}'/g, "'[redacted]'")
    // noms de fichiers isolés
    .replace(
      /\b[\w.\- ]{1,80}\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|heic|mp[34]|m4a|wav|mkv|avi|mov|zip|rar|7z|apk|txt|csv|epub)\b/gi,
      "[file]",
    )
    // longues séquences de chiffres (numéros, identifiants)
    .replace(/\b\d{6,}\b/g, "[num]");
  text = text.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Pile réduite aux emplacements de code de l'app (aucune donnée métier). */
function sanitizeStack(stack: unknown): string | undefined {
  if (typeof stack !== "string" || !stack) return undefined;
  const lines = stack
    .split("\n")
    .slice(0, 12)
    .map((line) =>
      line
        .replace(/https?:\/\/[^\s)]+\/(?=[\w.-]+:\d+:\d+)/g, "")
        .replace(/(content|file|blob):\/\/\S+/gi, "[uri]")
        .trim(),
    )
    .filter(Boolean);
  const joined = lines.join(" | ");
  return joined.length > 900 ? joined.slice(0, 900) : joined;
}

/** Journal de navigation technique (fil d'Ariane Crashlytics). */
export function logBreadcrumb(message: string): void {
  const p = plugin();
  if (!p) return;
  void p.log({ message: sanitizeDiagnostic(message, 120) }).catch(() => {});
}

/** Erreur non fatale importante. */
export function recordNonFatal(error: unknown, context?: string): void {
  const p = plugin();
  if (!p) return;
  const err = error instanceof Error ? error : undefined;
  const name = sanitizeDiagnostic(err?.name ?? "Error", 60) || "Error";
  const base = err?.message ?? (typeof error === "string" ? error : "unknown");
  const message = sanitizeDiagnostic(context ? `${context}: ${base}` : base);
  void p.recordError({ name, message, stack: sanitizeStack(err?.stack) }).catch(() => {});
}

let installed = false;

/**
 * Branche les rapports non fatals de la WebView. Deux écouteurs passifs,
 * aucun minuteur, aucune I/O : impact mémoire et batterie négligeable.
 */
export function installCrashReporting(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  const p = plugin();
  if (!p) return () => {};
  installed = true;

  void p
    .setKeys({
      keys: {
        app_version: __APP_VERSION__,
        webview_route: safeRoute(window.location.pathname),
        language: (navigator.language || "unknown").slice(0, 12),
      },
    })
    .catch(() => {});

  const onError = (event: ErrorEvent) => {
    recordNonFatal(event.error ?? event.message, "window.onerror");
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    recordNonFatal(event.reason, "unhandledrejection");
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}

/** Met à jour la clé de route (appelée aux changements d'écran). */
export function setCrashRoute(pathname: string): void {
  const p = plugin();
  if (!p) return;
  void p.setKeys({ keys: { webview_route: safeRoute(pathname) } }).catch(() => {});
}
