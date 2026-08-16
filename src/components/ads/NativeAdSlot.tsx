/**
 * Emplacement d'annonce native avancée.
 *
 * Le composant ne dessine rien : il réserve une hauteur et publie en
 * continu sa position à la couche native, qui superpose une vraie
 * `NativeAdView` Android au bon endroit (exigence AdMob pour le format
 * natif). Hors APK Android, il ne rend strictement rien — l'interface web
 * et l'aperçu Lovable restent identiques.
 */
import { useEffect, useRef, useState } from "react";
import { areAdsAvailable, destroyAd, hideAd, showAd } from "@/lib/native/ads";

type Props = {
  /** Identifiant stable de l'emplacement (un par écran). */
  id: string;
  /** Hauteur réservée, en pixels CSS. */
  height?: number;
  className?: string;
};

export function NativeAdSlot({ id, height = 260, className }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [available] = useState(() => areAdsAvailable());

  useEffect(() => {
    if (!available) return;
    const node = ref.current;
    if (!node) return;

    let frame = 0;
    let last = "";
    const sync = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const visible =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.width > 0 &&
        node.offsetParent !== null;
      if (!visible) {
        if (last !== "hidden") {
          last = "hidden";
          hideAd(id);
        }
        return;
      }
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
      if (key === last) return;
      last = key;
      showAd(id, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };
    // Une seule mesure par frame, même pendant un défilement rapide.
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(node);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      destroyAd(id);
    };
  }, [available, id]);

  if (!available) return null;
  return <div ref={ref} className={className} style={{ height }} aria-hidden />;
}
