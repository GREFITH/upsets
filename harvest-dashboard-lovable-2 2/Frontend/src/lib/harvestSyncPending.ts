const STORAGE_KEY = "upspring_harvest_sync_pending";
export const HARVEST_SYNC_EVENT = "upspring-harvest-sync";

/** Set on `pagehide` so we can tell "Failed to fetch" from a tab reload vs a dead API. */
const PAGE_UNLOAD_TS_KEY = "upspring_pagehide_ms";

export function hadLikelyRecentPageUnload(maxMs = 4500): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PAGE_UNLOAD_TS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < maxMs;
  } catch {
    return false;
  }
}

function installPageUnloadHintOnce(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __upspringPagehideInstalled?: boolean };
  if (w.__upspringPagehideInstalled) return;
  w.__upspringPagehideInstalled = true;
  const stamp = () => {
    try {
      sessionStorage.setItem(PAGE_UNLOAD_TS_KEY, String(Date.now()));
    } catch {
      /* empty */
    }
  };
  window.addEventListener("beforeunload", stamp);
  window.addEventListener("pagehide", stamp);
}

installPageUnloadHintOnce();

/** Drop stuck "syncing" UI after this long (ms). */
const PENDING_TTL_MS = 48 * 60 * 60 * 1000;

function migrateSessionStorageToLocal(): void {
  try {
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    if (!fromSession) return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      try {
        localStorage.setItem(STORAGE_KEY, fromSession);
      } catch {
        return;
      }
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / blocked storage
  }
}

function readStorageRaw(): string | null {
  migrateSessionStorageToLocal();
  try {
    return localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
  } catch {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

function writeStorageRaw(raw: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // ignore
  }
}

export type HarvestSyncPendingPayload = {
  /** Server `lastSuccessAt` when the user clicked sync (normalized ms string); cleared when API reports a newer success. */
  baselineLastSuccessAt: string | null;
  requestedAt: string;
};

/** Canonical key for comparing API lastSuccessAt across ISO variants (Z vs +00:00). */
export function normalizeHarvestLastSuccessAt(iso: string | null | undefined): string | null {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (s === "") return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return s;
  return String(t);
}

/**
 * True when the server's `lastSuccessAt` means our pending manual sync is done (or obsolete),
 * as opposed to stale data that loaded after we stored baseline `null` before operations-data finished.
 */
export function harvestPendingSupersededByServer(
  payload: HarvestSyncPendingPayload,
  lastSuccessAt: string | null | undefined,
): boolean {
  const cur = normalizeHarvestLastSuccessAt(lastSuccessAt);
  const base = payload.baselineLastSuccessAt;
  if (cur == null) return false;
  if (base != null) {
    return cur !== base;
  }
  const curMs = Number(cur);
  const reqMs = new Date(payload.requestedAt).getTime();
  if (Number.isNaN(curMs)) {
    return true;
  }
  return curMs > reqMs;
}

function parsePayload(raw: string): HarvestSyncPendingPayload | "legacy" | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.requestedAt !== "string") return null;
    if (!("baselineLastSuccessAt" in o)) return "legacy";
    const b = o.baselineLastSuccessAt;
    const rawBaseline = b === null || typeof b === "string" ? (b as string | null) : null;
    const baselineLastSuccessAt = normalizeHarvestLastSuccessAt(rawBaseline);
    return { baselineLastSuccessAt, requestedAt: o.requestedAt };
  } catch {
    return null;
  }
}

function isExpired(requestedAt: string): boolean {
  return Date.now() - new Date(requestedAt).getTime() > PENDING_TTL_MS;
}

export function getHarvestSyncPendingPayload(): HarvestSyncPendingPayload | "legacy" | null {
  try {
    const raw = readStorageRaw();
    if (!raw) return null;
    const parsed = parsePayload(raw);
    if (!parsed) return null;
    if (parsed === "legacy") {
      let req: string | undefined;
      try {
        req = (JSON.parse(raw) as { requestedAt?: string }).requestedAt;
      } catch {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* empty */
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* empty */
        }
        window.dispatchEvent(new Event(HARVEST_SYNC_EVENT));
        return null;
      }
      if (typeof req !== "string" || isExpired(req)) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* empty */
        }
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* empty */
        }
        window.dispatchEvent(new Event(HARVEST_SYNC_EVENT));
        return null;
      }
      return "legacy";
    }
    if (isExpired(parsed.requestedAt)) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* empty */
      }
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* empty */
      }
      window.dispatchEvent(new Event(HARVEST_SYNC_EVENT));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getHarvestSyncRequestedAt(): string | null {
  try {
    const raw = readStorageRaw();
    if (!raw) return null;
    const o = JSON.parse(raw) as { requestedAt?: string };
    return typeof o.requestedAt === "string" ? o.requestedAt : null;
  } catch {
    return null;
  }
}

/** Record a manual sync start. Pass the current API `lastSuccessAt` so we can detect completion after reload without clock skew. */
export function setHarvestSyncPending(baselineLastSuccessAt: string | null): void {
  const payload: HarvestSyncPendingPayload = {
    baselineLastSuccessAt: normalizeHarvestLastSuccessAt(baselineLastSuccessAt),
    requestedAt: new Date().toISOString(),
  };
  writeStorageRaw(JSON.stringify(payload));
  window.dispatchEvent(new Event(HARVEST_SYNC_EVENT));
}

export function clearHarvestSyncPending(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(HARVEST_SYNC_EVENT));
}
