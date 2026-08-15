/**
 * Onboarding officiel de GeniusFiles — persistance minimale.
 *
 * Un seul drapeau local : l'onboarding est présenté à la première
 * utilisation, puis plus jamais dès que l'utilisateur a appuyé sur
 * « Commencer » ou « Passer ». Aucune donnée utilisateur n'est touchée.
 */
const KEY = "gf.onboarding.v1";

/** Vrai si l'onboarding a déjà été vu (jamais lu pendant le SSR). */
export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "done";
  } catch {
    // Stockage indisponible : ne jamais bloquer l'application.
    return true;
  }
}

/** Marque l'onboarding comme terminé. Idempotent, jamais bloquant. */
export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(KEY, "done");
  } catch {
    /* stockage indisponible : l'onboarding se ferme quand même */
  }
}
