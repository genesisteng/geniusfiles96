/**
 * GeniusFiles — garde-fou central des chemins.
 *
 * Toute opération de fichier (interface, Genius AI, automatisations,
 * nettoyeur, corbeille) passe par les mêmes vérifications :
 *
 *   1. les segments d'un `PathRef` sont de vrais noms de dossiers —
 *      jamais `..`, jamais un séparateur, jamais un caractère de
 *      contrôle : aucune sortie de l'emplacement prévu n'est possible ;
 *   2. l'emplacement absolu résolu n'est ni le coffre-fort ni un
 *      répertoire système : le coffre-fort reste inaccessible depuis
 *      toutes les autres fonctionnalités, quel que soit le parcours ;
 *   3. un appelant « non fiable » (Genius AI, automatisation) est en
 *      plus limité aux racines de stockage réellement montées : il ne
 *      peut ni viser un chemin absolu arbitraire (`abs:`), ni un dossier
 *      masqué, ni un volume inconnu.
 *
 * La protection vit ici, au niveau des opérations réelles, et non dans
 * l'interface : une action interdite le reste, d'où qu'elle vienne.
 */
import { listRoots, toAbsolutePath } from "@/lib/files/fs";
import type { PathRef } from "@/lib/files/types";
import { t } from "@/lib/i18n";

/** Dossier physique du coffre-fort (masqué par un point). */
export const VAULT_DIR_NAME = ".GeniusFilesVault";

/** Vrai si la chaîne contient un caractère de contrôle (invisible). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
const RESERVED_SEGMENTS = new Set(["", ".", ".."]);

/** Répertoires que l'application ne doit jamais modifier ni exposer. */
const FORBIDDEN_ABS_PREFIXES = ["/proc", "/sys", "/dev", "/system", "/vendor", "/data/data"];

export type PathCheck = { ok: true } | { ok: false; reason: string };

const OK: PathCheck = { ok: true };

/** Un segment de chemin est-il un nom de dossier réel et inoffensif ? */
export function isSafeSegment(segment: unknown): boolean {
  if (typeof segment !== "string") return false;
  const s = segment.trim();
  if (RESERVED_SEGMENTS.has(s)) return false;
  if (s.length > 255) return false;
  if (s.includes("/") || s.includes("\\")) return false;
  if (hasControlChar(s)) return false;
  return true;
}

/** Nom de fichier / dossier accepté pour une création ou un renommage. */
export function checkEntryName(name: unknown): PathCheck {
  if (!isSafeSegment(name)) return { ok: false, reason: t("system.security.invalidName") };
  const clean = String(name).trim();
  if (clean === VAULT_DIR_NAME) return { ok: false, reason: t("system.security.vaultProtected") };
  return OK;
}

/** Vrai lorsque le chemin absolu touche le coffre-fort. */
export function isVaultLocation(absolute: string): boolean {
  const normalized = absolute.replace(/\\/g, "/");
  return normalized.split("/").includes(VAULT_DIR_NAME);
}

/** Vrai lorsque le chemin absolu vise un emplacement protégé. */
export function isProtectedLocation(absolute: string): boolean {
  if (isVaultLocation(absolute)) return true;
  const normalized = absolute.replace(/\\/g, "/").replace(/\/+/g, "/");
  return FORBIDDEN_ABS_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/**
 * Vérification appliquée à TOUTE opération de fichier, quel que soit
 * l'appelant. Ne bloque pas les racines internes légitimes (corbeille,
 * fichier entrant), seulement les chemins malformés ou protégés.
 */
export function checkOperationPath(path: unknown): PathCheck {
  if (!path || typeof path !== "object")
    return { ok: false, reason: t("system.security.invalidPath") };
  const ref = path as PathRef;
  if (typeof ref.rootId !== "string" || !ref.rootId) {
    return { ok: false, reason: t("system.security.invalidPath") };
  }
  if (hasControlChar(ref.rootId)) return { ok: false, reason: t("system.security.invalidPath") };
  const segments = ref.segments;
  if (!Array.isArray(segments)) return { ok: false, reason: t("system.security.invalidPath") };
  for (const segment of segments) {
    if (!isSafeSegment(segment)) return { ok: false, reason: t("system.security.invalidPath") };
  }
  let absolute: string;
  try {
    absolute = toAbsolutePath(ref);
  } catch {
    return { ok: false, reason: t("system.security.invalidPath") };
  }
  // Un composant strictement égal à ".." est une évasion ; un nom qui
  // contient simplement deux points ("notes..v2") reste légitime.
  if (absolute.split("/").includes("..")) {
    return { ok: false, reason: t("system.security.invalidPath") };
  }
  if (isProtectedLocation(absolute)) return { ok: false, reason: t("system.security.blockedPath") };
  return OK;
}

/** Même contrôle appliqué à un nom d'entrée ciblé dans un dossier. */
export function checkOperationTarget(parent: unknown, name: unknown): PathCheck {
  const base = checkOperationPath(parent);
  if (!base.ok) return base;
  if (!isSafeSegment(name)) return { ok: false, reason: t("system.security.invalidName") };
  const abs = `${toAbsolutePath(parent as PathRef)}/${String(name).trim()}`;
  if (isProtectedLocation(abs)) return { ok: false, reason: t("system.security.blockedPath") };
  return OK;
}

/**
 * Contrôle renforcé pour les appelants non fiables : Genius AI et les
 * automatisations. La cible doit être une racine de stockage réellement
 * montée, sans dossier masqué dans le chemin.
 */
export function checkUntrustedPath(path: unknown): PathCheck {
  const base = checkOperationPath(path);
  if (!base.ok) return base;
  const ref = path as PathRef;
  if (ref.rootId.startsWith("abs:")) {
    return { ok: false, reason: t("system.security.untrustedRoot") };
  }
  const root = listRoots().find((r) => r.id === ref.rootId);
  if (!root) return { ok: false, reason: t("system.security.untrustedRoot") };
  if (!root.available) return { ok: false, reason: t("system.security.untrustedRoot") };
  if (ref.segments.some((s) => s.trim().startsWith("."))) {
    return { ok: false, reason: t("system.security.blockedPath") };
  }
  return OK;
}

/** Plafonds appliqués aux opérations déclenchées par Genius AI. */
export const UNTRUSTED_LIMITS = {
  delete: 200,
  transfer: 1000,
  compress: 1000,
  share: 20,
} as const;

export function checkUntrustedVolume(count: number, limit: number): PathCheck {
  if (count > limit) {
    return { ok: false, reason: t("system.security.tooManyItems", { count: limit }) };
  }
  return OK;
}
