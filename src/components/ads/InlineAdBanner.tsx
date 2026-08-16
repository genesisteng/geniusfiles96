/**
 * Emplacement publicitaire *dans le flux* de la page.
 *
 * La bannière native occupe sa propre bande de contenu : le bloc réserve
 * réellement sa hauteur dans la mise en page (rien n'est recouvert), et la
 * vue native est repositionnée sur ses coordonnées à chaque défilement.
 * Hors écran, elle est masquée ; sans annonce chargée, le bloc se réduit à
 * zéro et l'interface retrouve tout son espace.
 */
import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { useAdSlot } from "@/lib/ads/useAdSlot";
import { TEST_BANNER_UNIT_ID } from "@/lib/ads/policy";
import { hideBanner, onBannerStatus, removeBanner, showBannerAt } from "@/lib/native/ads";

type Props = {
  /** Identifiant logique de l'emplacement (politique par écran). */
  slot?: string;
  /** Bloc d'annonces ; par défaut le bloc de TEST officiel Google. */
  unitId?: string;
};

export function InlineAdBanner({ slot = "inline", unitId = TEST_BANNER_UNIT_ID }: Props) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const allowed = useAdSlot(slot);
  /* Hauteur réellement occupée : 0 tant qu'aucune annonce n'est chargée. */
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    return onBannerStatus(({ loaded, height: h }) => setHeight(loaded && h > 0 ? h : 0));
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let last = "";
    let hidden = false;

    const apply = () => {
      frame = 0;
      if (disposed) return;
      const rect = host.getBoundingClientRect();
      const vh = window.innerHeight;
      const visible = rect.width >= 40 && rect.bottom > 0 && rect.top < vh;
      if (!visible) {
        if (!hidden) {
          hidden = true;
          void hideBanner();
        }
        return;
      }
      hidden = false;
      const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}`;
      if (key === last) return;
      last = key;
      void showBannerAt({ x: rect.left, y: rect.top, width: rect.width, unitId });
    };

    /* Une seule mise à jour par image : le défilement reste fluide. */
    const sync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    };

    const ro = new ResizeObserver(sync);
    ro.observe(host);
    window.addEventListener("scroll", sync, { passive: true, capture: true });
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    sync();

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      setHeight(0);
      void removeBanner();
    };
  }, [allowed, unitId]);

  if (!allowed) return null;

  return (
    <section
      aria-label={t("ads.label")}
      /* Sans annonce chargée : hauteur nulle, aucun espace perdu. */
      className={`overflow-hidden transition-[height,opacity] duration-200 ease-out ${
        height > 0 ? "opacity-100" : "pointer-events-none h-0 opacity-0"
      }`}
    >
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        {t("ads.label")}
      </p>
      <div
        ref={hostRef}
        aria-hidden="true"
        className="w-full rounded-2xl bg-muted/30"
        style={{ height: height || 1 }}
      />
    </section>
  );
}
