/**
 * Emplacement publicitaire réutilisable (bannière adaptative AdMob).
 *
 * Ce composant n'est posé dans aucun écran pour l'instant : il constitue la
 * base propre pour les prochains emplacements. Règles appliquées :
 *  - rien n'est rendu hors APK Android, sur un écran sans publicité
 *    (coffre-fort…) ou pendant une opération importante ;
 *  - aucune hauteur n'est réservée tant qu'aucune annonce n'est réellement
 *    chargée (pas d'espace vide en cas d'échec ou sans connexion) ;
 *  - la bannière est ancrée au-dessus de la barre de navigation, ne bouge
 *    pas au défilement, ne recouvre rien et n'intercepte aucun geste ;
 *  - toute erreur est silencieuse : l'application reste utilisable.
 */
import { useEffect, useRef, useState } from "react";

import { useAdSlot } from "@/lib/ads/useAdSlot";
import { TEST_BANNER_UNIT_ID } from "@/lib/ads/policy";
import { onBannerStatus, removeBanner, showBannerAt } from "@/lib/native/ads";

type Props = {
  /** Identifiant logique de l'emplacement (pour la politique par écran). */
  slot?: string;
  /** Bloc d'annonces AdMob ; par défaut le bloc de TEST officiel Google. */
  unitId?: string;
  className?: string;
};

export function AdBanner({ slot = "default", unitId = TEST_BANNER_UNIT_ID }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const allowed = useAdSlot(slot);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    return onBannerStatus(({ loaded, height: h }) => {
      setHeight(loaded && h > 0 ? h : 0);
    });
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let last = "";

    const sync = () => {
      if (disposed) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < 40) return;
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}`;
      if (key === last) return;
      last = key;
      void showBannerAt({ x: rect.left, y: rect.top, width: rect.width, unitId });
    };

    // Position fixe : seuls un redimensionnement ou un changement de hauteur
    // de bannière peuvent la déplacer — jamais le défilement.
    const ro = new ResizeObserver(sync);
    ro.observe(host);
    window.addEventListener("resize", sync);
    sync();

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener("resize", sync);
      setHeight(0);
      void removeBanner();
    };
  }, [allowed, unitId]);

  // Réserve la hauteur en bas de page uniquement si une annonce est affichée.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--gf-ad-h", height > 0 ? `${height}px` : "0px");
    return () => root.style.setProperty("--gf-ad-h", "0px");
  }, [height]);

  if (!allowed) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-[560px] px-4"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))", height: height || 50 }}
    />
  );
}
