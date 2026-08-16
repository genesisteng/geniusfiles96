/**
 * Hook de décision pour un emplacement publicitaire.
 *
 * Renvoie `true` seulement dans l'APK Android (pont natif disponible), hors
 * écran sans publicité et hors opération importante. Aucun rendu, aucun
 * effet de bord : les composants d'emplacement s'en servent pour ne rien
 * réserver ni charger quand la publicité n'est pas autorisée.
 */
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import { adsAvailable } from "@/lib/native/ads";

import { adSlotAllowed, subscribeAdsPolicy, type AdSlotId } from "./policy";

export function useAdSlot(slot: AdSlotId): boolean {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [native, setNative] = useState(false);
  const [, forceUpdate] = useState(0);

  // Le pont natif n'est pas encore peuplé au tout premier rendu.
  useEffect(() => {
    if (adsAvailable()) {
      setNative(true);
      return;
    }
    const timer = window.setTimeout(() => setNative(adsAvailable()), 800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => subscribeAdsPolicy(() => forceUpdate((n) => n + 1)), []);

  return native && adSlotAllowed(slot, pathname);
}
