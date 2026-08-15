import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useT } from "@/lib/i18n";
import { isOnboardingDone, markOnboardingDone } from "@/lib/onboarding/store";
import { BACK_PRIORITY, useBackHandler } from "@/lib/navigation/back-stack";
import { cn } from "@/lib/utils";

/**
 * Onboarding officiel de GeniusFiles — exactement 6 écrans.
 *
 * Règles structurelles (non négociables) :
 *  - 6 écrans, jamais un 7e ;
 *  - « Continuer » sur les écrans 1 à 5, « Commencer » sur le 6e ;
 *  - « Passer » disponible depuis les 6 écrans ;
 *  - les illustrations sont STRICTEMENT statiques (aucune transformation,
 *    aucune animation) ; seules les micro-animations d'interface existent,
 *    et elles disparaissent si la réduction des mouvements est active ;
 *  - aucune permission n'est demandée ici.
 *
 * L'overlay est un simple calque au-dessus de l'application : il ne touche
 * ni à la navigation, ni aux routes, ni au démarrage.
 */

const TOTAL = 6 as const;

const STEPS = [1, 2, 3, 4, 5, 6] as const;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Illustration officielle : jamais animée, jamais transformée. */
function Illustration({ step, priority }: { step: number; priority: boolean }) {
  return (
    <img
      src={`/onboarding/step-${step}.webp`}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={720}
      height={958}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      className="mx-auto h-full w-auto max-w-full select-none object-contain"
    />
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 px-3.5 py-2.5">
      <p className="text-[13px] font-medium leading-tight text-foreground">{title}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{desc}</p>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary" />
      <span>{text}</span>
    </li>
  );
}

function StepBody({ step }: { step: number }) {
  const t = useT();

  if (step === 2) {
    return (
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {t("onboarding.s2.tags")}
      </p>
    );
  }
  if (step === 3) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              title={t(`onboarding.s3.item${i}.title`)}
              desc={t(`onboarding.s3.item${i}.desc`)}
            />
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">{t("onboarding.s3.more")}</p>
      </div>
    );
  }
  if (step === 4) {
    return (
      <div className="space-y-2">
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Card
              key={i}
              title={t(`onboarding.s4.item${i}.title`)}
              desc={t(`onboarding.s4.item${i}.desc`)}
            />
          ))}
        </div>
        <p className="text-[12px] text-muted-foreground">{t("onboarding.s4.footer")}</p>
      </div>
    );
  }
  if (step === 5) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className="rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[12px] leading-tight text-foreground"
            >
              {t(`onboarding.s5.ex${i}`)}
            </span>
          ))}
        </div>
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t("onboarding.s5.footer")}
        </p>
      </div>
    );
  }
  if (step === 6) {
    return (
      <div className="space-y-2">
        <ul className="mx-auto max-w-sm space-y-1.5 text-left">
          {[1, 2, 3, 4].map((i) => (
            <Bullet key={i} text={t(`onboarding.s6.item${i}`)} />
          ))}
        </ul>
        <p className="text-sm font-semibold text-foreground">{t("onboarding.s6.footer")}</p>
      </div>
    );
  }
  return null;
}

function Slide({ step, active, reduced }: { step: number; active: boolean; reduced: boolean }) {
  const t = useT();
  return (
    <section
      className="flex h-full w-full shrink-0 snap-center snap-always flex-col overflow-y-auto px-6 pb-2 pt-14"
      aria-roledescription="slide"
      aria-label={t("onboarding.progress", { current: step, total: TOTAL })}
    >
      <div className="flex min-h-[34vh] flex-1 items-center justify-center py-2">
        <Illustration step={step} priority={step <= 2} />
      </div>
      <div
        className={cn(
          "shrink-0 space-y-2.5 pb-2 text-center",
          !reduced && active && "animate-fade-in",
        )}
      >
        <h2 className="text-balance text-[22px] font-semibold leading-tight text-foreground">
          {t(`onboarding.s${step}.title`)}
        </h2>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {t(`onboarding.s${step}.desc`)}
        </p>
        <StepBody step={step} />
      </div>
    </section>
  );
}

export function OnboardingOverlay() {
  const t = useT();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Décision prise après l'hydratation : aucun accès au stockage en SSR,
  // aucun impact sur le chemin critique de démarrage.
  useEffect(() => {
    if (!isOnboardingDone()) setOpen(true);
  }, []);

  const close = useCallback(() => {
    markOnboardingDone();
    setOpen(false);
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
    },
    [reduced],
  );

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setIndex((prev) => (prev === i ? prev : Math.min(TOTAL - 1, Math.max(0, i))));
  }, []);

  // Retour Android : revient à l'écran précédent de l'onboarding.
  useBackHandler(
    open,
    () => {
      if (index > 0) goTo(index - 1);
      return true;
    },
    BACK_PRIORITY.overlay,
  );

  const last = index === TOTAL - 1;
  const cta = useMemo(() => (last ? t("onboarding.start") : t("onboarding.continue")), [last, t]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.s1.title")}
      className="fixed inset-0 z-[70] flex flex-col bg-background pb-safe pl-safe pr-safe pt-safe"
    >
      <button
        type="button"
        onClick={close}
        className="absolute right-3 top-3 z-10 mt-safe mr-safe rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
      >
        {t("onboarding.skip")}
      </button>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STEPS.map((s, i) => (
          <Slide key={s} step={s} active={i === index} reduced={reduced} />
        ))}
      </div>

      <div className="shrink-0 space-y-4 px-6 pb-4 pt-3">
        <div
          className="flex items-center justify-center gap-2"
          role="group"
          aria-label={t("onboarding.progress", { current: index + 1, total: TOTAL })}
        >
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-label={t("onboarding.goToStep", { step: s })}
              aria-current={i === index ? "step" : undefined}
              onClick={() => goTo(i)}
              className="grid h-6 place-items-center px-0.5"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full",
                  !reduced && "transition-all duration-200",
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => (last ? close() : goTo(index + 1))}
          className={cn(
            "h-12 w-full rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground",
            !reduced && "transition-transform duration-150 active:scale-[0.98]",
          )}
        >
          <span key={cta} className={cn(!reduced && "inline-block animate-fade-in")}>
            {cta}
          </span>
        </button>

        <p className="sr-only" aria-live="polite">
          {t("onboarding.progress", { current: index + 1, total: TOTAL })}
        </p>
      </div>
    </div>
  );
}
