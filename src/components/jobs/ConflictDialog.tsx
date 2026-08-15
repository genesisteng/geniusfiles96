/**
 * Dialogue unique de conflit (copie / déplacement).
 *
 * Monté une seule fois dans la coquille de l'application : quel que soit
 * l'écran qui a lancé l'opération, la question posée et les choix offerts
 * sont exactement les mêmes. La page derrière reste intacte (aucun
 * rechargement, aucune perte de position).
 */
import { useSyncExternalStore, useEffect, useState } from "react";
import { FileWarning } from "lucide-react";
import { BottomSheet, PrimaryButton } from "@/components/files/BottomSheet";
import {
  answerConflict,
  getConflictPrompt,
  subscribeConflicts,
  type ConflictPrompt,
} from "@/lib/transfers/conflicts";
import { useT } from "@/lib/i18n";

function usePrompt(): ConflictPrompt | null {
  return useSyncExternalStore(
    subscribeConflicts,
    getConflictPrompt,
    () => null as ConflictPrompt | null,
  );
}

export function ConflictDialog() {
  const t = useT();
  const prompt = usePrompt();
  const [applyToAll, setApplyToAll] = useState(false);

  // Chaque nouvelle opération repart d'une décision propre.
  useEffect(() => {
    if (prompt?.remaining === 0) setApplyToAll(false);
  }, [prompt?.id, prompt?.remaining]);

  const open = prompt !== null;
  const multiple = (prompt?.remaining ?? 0) > 0;

  return (
    <BottomSheet
      open={open}
      onClose={() => answerConflict("cancel", false)}
      fullScreen={false}
      footer={
        <>
          <PrimaryButton variant="ghost" onClick={() => answerConflict("cancel", false)}>
            {t("ops.conflict.cancel")}
          </PrimaryButton>
          <PrimaryButton variant="ghost" onClick={() => answerConflict("skip", applyToAll)}>
            {t("ops.conflict.skip")}
          </PrimaryButton>
          <PrimaryButton variant="danger" onClick={() => answerConflict("overwrite", applyToAll)}>
            {t("ops.conflict.overwrite")}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4 pr-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <FileWarning className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 space-y-1.5">
            <p className="text-[17px] font-semibold leading-snug text-foreground">
              {t("ops.conflict.title")}
            </p>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              {prompt?.isDirectory
                ? t("ops.conflict.folderExists")
                : t("ops.conflict.fileExists")}
            </p>
          </div>
        </div>
        <div className="space-y-1 rounded-2xl bg-surface-2 p-3.5 text-[13px]">
          <p className="truncate font-semibold text-foreground">{prompt?.name}</p>
          {prompt?.destLabel ? (
            <p className="truncate text-muted-foreground">
              {t("ops.conflict.destination", { dest: prompt.destLabel })}
            </p>
          ) : null}
          {multiple ? (
            <p className="text-muted-foreground">
              {t("ops.conflict.remaining", { count: prompt?.remaining ?? 0 })}
            </p>
          ) : null}
        </div>
        {multiple ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14px] text-foreground">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--primary)]"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
            />
            {t("ops.conflict.applyToAll")}
          </label>
        ) : null}
      </div>
    </BottomSheet>
  );
}
