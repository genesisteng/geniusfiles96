/**
 * Emplacement publicitaire ancré en bas de l'écran.
 *
 * La bannière native est posée juste au-dessus de la barre de navigation et
 * ne bouge plus pendant le défilement. L'espace qu'elle occupe est réservé
 * dans la mise en page (variable CSS `--gf-ad-h`), donc elle ne recouvre ni
 * le contenu ni la navigation. Sur le web (aperçu Lovable, SSR) rien n'est
 * rendu : aucun espace vide, aucune régression visuelle.
 */
import { useEffect, useRef, useState } from "react";

import { adsAvailable, removeBanner, showBannerAt } from "@/lib/native/ads";

type Props = {
  /** Bloc d'annonces AdMob ; par défaut le bloc de test Google. */
  unitId?: string;
  className?: string;
};

export function AdBanner({ unitId }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(50);
  const [enabled, setEnabled] = useState(false);

  // Le pont natif n'est pas encore peuplé au tout premier rendu.
  useEffect(() => {
    if (adsAvailable()) {
      setEnabled(true);
      return;
    }
    const timer = window.setTimeout(() => setEnabled(adsAvailable()), 800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!enabled) return;
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
      void showBannerAt({ x: rect.left, y: rect.top, width: rect.width, unitId }).then((h) => {
        if (!disposed && h > 0) setHeight(h);
      });
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
      void removeBanner();
    };
  }, [enabled, unitId]);

  // Réserve la hauteur en bas de page pour ne rien recouvrir.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--gf-ad-h", enabled ? `${height}px` : "0px");
    return () => root.style.setProperty("--gf-ad-h", "0px");
  }, [enabled, height]);

  if (!enabled) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-[560px] px-4"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))", height }}
    />
  );
}
