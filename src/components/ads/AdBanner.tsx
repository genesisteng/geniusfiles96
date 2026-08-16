/**
 * Bannière adaptative globale de GeniusFiles.
 *
 * La bannière fait partie de la mise en page : elle occupe sa propre bande,
 * intercalée entre le contenu et la navigation principale
 * (CONTENU → BANNIÈRE → NAVIGATION). Règles appliquées :
 *  - rien n'est rendu hors APK Android, sur un écran sans publicité
 *    (coffre-fort…) ou pendant une opération importante ;
 *  - aucune hauteur n'est réservée tant qu'aucune annonce n'est réellement
 *    chargée (pas d'espace vide en cas d'échec ou sans connexion) ;
 *  - la hauteur réservée est publiée dans `--gf-ad-h`, que le contenu
 *    ajoute à son espace bas : le dernier élément reste accessible ;
 *  - la bande est ancrée juste au-dessus de la navigation (mesurée en
 *    direct), ne bouge pas au défilement et n'intercepte aucun geste ;
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
  /**
   * Sélecteur de la barre de navigation à ne jamais recouvrir : la bande
   * publicitaire se place exactement au-dessus d'elle. Absente ⇒ la bande
   * se pose proprement au bas de l'écran (marge sûre incluse).
   */
  anchorSelector?: string;
  className?: string;
};

export function AdBanner({
  slot = "default",
  unitId = TEST_BANNER_UNIT_ID,
  anchorSelector,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const allowed = useAdSlot(slot);
  const [height, setHeight] = useState(0);
  const [anchorH, setAnchorH] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    return onBannerStatus(({ loaded, height: h }) => {
      setHeight(loaded && h > 0 ? h : 0);
    });
  }, [allowed]);

  /* Hauteur réelle de la navigation : la bande se cale juste au-dessus,
     sans jamais la recouvrir, quelle que soit la taille de l'écran. */
  useEffect(() => {
    if (!allowed || !anchorSelector) return;
    const nav = document.querySelector(anchorSelector);
    if (!nav) return;
    const measure = () => setAnchorH(nav.getBoundingClientRect().height);
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    measure();
    return () => ro.disconnect();
  }, [allowed, anchorSelector]);

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

    // Position fixe : seuls un redimensionnement, une rotation ou un
    // changement de hauteur peuvent la déplacer — jamais le défilement.
    const ro = new ResizeObserver(sync);
    ro.observe(host);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const raf = window.requestAnimationFrame(sync);
    sync();

    return () => {
      disposed = true;
      ro.disconnect();
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      setHeight(0);
      void removeBanner();
    };
  }, [allowed, unitId, anchorH]);

  // Réserve la hauteur en bas de page uniquement si une annonce est affichée.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--gf-ad-h", height > 0 ? `${height}px` : "0px");
    return () => root.style.setProperty("--gf-ad-h", "0px");
  }, [height]);

  if (!allowed) return null;

  const bottom = anchorSelector
    ? `${anchorH}px`
    : "calc(env(safe-area-inset-bottom) + 8px)";

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-[560px] px-4 transition-[height] duration-200 ease-out"
      style={{ bottom, height: height || 50 }}
    />
  );
}
