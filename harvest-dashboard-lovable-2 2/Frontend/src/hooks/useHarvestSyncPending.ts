import { useEffect, useMemo, useState } from "react";
import {
  clearHarvestSyncPending,
  getHarvestSyncPendingPayload,
  harvestPendingSupersededByServer,
  HARVEST_SYNC_EVENT,
} from "@/lib/harvestSyncPending";

function pendingFromStorage(lastSuccessAt: string | null | undefined): boolean {
  const payload = getHarvestSyncPendingPayload();
  if (!payload) return false;
  if (payload === "legacy") {
    return true;
  }
  if (harvestPendingSupersededByServer(payload, lastSuccessAt)) {
    return false;
  }
  return true;
}

/**
 * True while a manual Harvest sync was requested and not yet cleared (success/error, new lastSuccessAt vs baseline, or TTL).
 */
export function useHarvestSyncPending(lastSuccessAt?: string | null): boolean {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const on = () => setRev((n) => n + 1);
    window.addEventListener(HARVEST_SYNC_EVENT, on);
    return () => window.removeEventListener(HARVEST_SYNC_EVENT, on);
  }, []);

  useEffect(() => {
    const payload = getHarvestSyncPendingPayload();
    if (!payload || payload === "legacy") return;
    if (harvestPendingSupersededByServer(payload, lastSuccessAt)) {
      clearHarvestSyncPending();
    }
  }, [lastSuccessAt]);

  return useMemo(() => pendingFromStorage(lastSuccessAt), [lastSuccessAt, rev]);
}
