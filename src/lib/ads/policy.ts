/**
 * Politique publicitaire de GeniusFiles.
 *
 * Ce module ne rend rien : il décide seulement *si* un emplacement
 * publicitaire a le droit de s'afficher. Il permet d'activer ou de
 * désactiver les annonces par écran et de les suspendre temporairement
 * pendant une opération importante (copie, chiffrement, export…).
 *
 * Aucune donnée personnelle n'est utilisée ni transmise ici.
 */

/** Identifiants d'emplacements prévus (aucun n'est encore posé dans l'UI). */
export type AdSlotId = string;

/** Bloc de TEST officiel Google, utilisé pendant tout le développement. */
export const TEST_BANNER_UNIT_ID = "ca-app-pub-3940256099942544/9214589741";

/**
 * Écrans sans aucune publicité : coffre-fort (contenu sensible) et
 * lecteurs/éditeurs plein écran où une bannière gênerait l'interaction.
 */
const AD_FREE_ROUTES = ["/coffre-fort", "/editeur-audio", "/assistant"];

/** Raisons de suspension actives (opérations importantes en cours). */
const suspensions = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** S'abonner aux changements de politique (suspension / reprise). */
export function subscribeAdsPolicy(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Suspend toutes les annonces tant que `resumeAds(reason)` n'est pas appelé. */
export function suspendAds(reason: string): void {
  if (suspensions.has(reason)) return;
  suspensions.add(reason);
  emit();
}

/** Lève une suspension posée par `suspendAds`. */
export function resumeAds(reason: string): void {
  if (!suspensions.delete(reason)) return;
  emit();
}

/** `true` si une opération importante bloque actuellement les annonces. */
export function adsSuspended(): boolean {
  return suspensions.size > 0;
}

/** `true` si le chemin courant est un écran déclaré sans publicité. */
export function isAdFreeRoute(pathname: string): boolean {
  return AD_FREE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Décision finale pour un emplacement donné sur un chemin donné. */
export function adSlotAllowed(_slot: AdSlotId, pathname: string): boolean {
  return !adsSuspended() && !isAdFreeRoute(pathname);
}
