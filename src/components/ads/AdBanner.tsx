/**
 * Emplacement publicitaire.
 *
 * Réserve un bloc dans la page et y superpose la bannière native AdMob à
 * l'emplacement exact du bloc. Sur le web (aperçu Lovable, SSR) rien n'est
 * rendu : aucun espace vide, aucune régression visuelle.
 */
import { useEffect, useRef, useState } from "react";

import { adsAvailable, hideBanner, removeBanner, showBannerAt } from "@/lib/native/ads";

type Props = {
  /** Bloc d'annonces AdMob ; par défaut le bloc de test Google. */
  unitId?: string;
  className?: string;
};

export function AdBanner({ unitId, className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
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

    let frame = 0;
    let disposed = false;
    let visible = true;
    let last = "";

    const sync = () => {
      frame = 0;
      if (disposed) return;
      const rect = host.getBoundingClientRect();
      const offScreen =
        !visible || rect.width < 40 || rect.bottom < 0 || rect.top > window.innerHeight;
      if (offScreen) {
        if (last !== "hidden") {
          last = "hidden";
          void hideBanner();
        }
        return;
      }
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}`;
      if (key === last) return;
      last = key;
      void showBannerAt({ x: rect.left, y: rect.top, width: rect.width, unitId }).then((h) => {
        if (!disposed && h > 0) setHeight(h);
      });
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting);
        schedule();
      },
      { threshold: 0 },
    );
    io.observe(host);

    const ro = new ResizeObserver(schedule);
    ro.observe(host);

    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      void removeBanner();
    };
  }, [enabled, unitId]);

  if (!enabled) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={className}
      style={{ height: height > 0 ? height : 50 }}
    />
  );
}
