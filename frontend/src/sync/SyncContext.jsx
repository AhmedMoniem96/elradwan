import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const SyncContext = createContext(null);

const OUTBOX_KEY = 'sync_outbox_events';
const CURSOR_KEY = 'sync_server_cursor';
const DEVICE_ID_KEY = 'active_device_id';

const loadOutbox = () => {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistOutbox = (events) => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(events));
};

const loadCursor = () => Number(localStorage.getItem(CURSOR_KEY) || 0);
const persistCursor = (cursor) => localStorage.setItem(CURSOR_KEY, String(cursor));

export function SyncProvider({ children, runtimeContext, onServerUpdates }) {
  const [outbox, setOutbox] = useState(loadOutbox);
  const pushInFlight = useRef(false);
  const pullInFlight = useRef(false);

  useEffect(() => {
    persistOutbox(outbox);
  }, [outbox]);

  const canSync = Boolean(runtimeContext?.deviceId && runtimeContext?.branchId && runtimeContext?.userId);

  const pushNow = useCallback(async () => {
    if (!canSync || pushInFlight.current || outbox.length === 0) {
      return;
    }

    pushInFlight.current = true;
    try {
      const batch = outbox.slice(0, 50);
      const response = await axios.post('/api/v1/sync/push', {
        device_id: runtimeContext.deviceId,
        events: batch,
      });

      const acknowledged = new Set(response.data?.acknowledged || []);
      const rejected = new Set((response.data?.rejected || []).map((item) => item.event_id));
      const completed = new Set([...acknowledged, ...rejected]);
      if (completed.size > 0) {
        setOutbox((prev) => prev.filter((event) => !completed.has(event.event_id)));
      }
      if (typeof response.data?.server_cursor === 'number') {
        persistCursor(response.data.server_cursor);
      }
    } catch (error) {
      console.error('Sync push failed', error);
    } finally {
      pushInFlight.current = false;
    }
  }, [canSync, outbox, runtimeContext]);

  const pullNow = useCallback(async () => {
    if (!canSync || pullInFlight.current) {
      return;
    }

    pullInFlight.current = true;
    try {
      let cursor = loadCursor();
      let hasMore = false;
      const allUpdates = [];

      do {
        const response = await axios.post('/api/v1/sync/pull', {
          device_id: runtimeContext.deviceId,
          cursor,
          limit: 100,
        });

        const payload = response.data || {};
        const updates = payload.updates || [];
        allUpdates.push(...updates);
        cursor = payload.server_cursor ?? cursor;
        hasMore = Boolean(payload.has_more);
      } while (hasMore);

      persistCursor(cursor);
      if (allUpdates.length > 0 && onServerUpdates) {
        onServerUpdates(allUpdates);
      }
    } catch (error) {
      console.error('Sync pull failed', error);
    } finally {
      pullInFlight.current = false;
    }
  }, [canSync, onServerUpdates, runtimeContext]);

  const enqueueEvent = useCallback(
    ({ eventType, payload }) => {
      if (!runtimeContext?.deviceId || !runtimeContext?.branchId || !runtimeContext?.userId) {
        throw new Error('Missing runtime sync context (branch/device/user).');
      }

      const event = {
        event_id: crypto.randomUUID(),
        event_type: eventType,
        payload: {
          ...payload,
          branch_id: runtimeContext.branchId,
          device_id: runtimeContext.deviceId,
          user_id: runtimeContext.userId,
        },
        created_at: new Date().toISOString(),
        device_id: runtimeContext.deviceId,
      };

      setOutbox((prev) => [...prev, event]);
      return event;
    },
    [runtimeContext],
  );

  useEffect(() => {
    if (!canSync) {
      return;
    }

    pushNow();
    pullNow();

    const pushTimer = setInterval(pushNow, 4000);
    const pullTimer = setInterval(pullNow, 4000);

    return () => {
      clearInterval(pushTimer);
      clearInterval(pullTimer);
    };
  }, [canSync, pullNow, pushNow]);

  useEffect(() => {
    if (runtimeContext?.deviceId) {
      localStorage.setItem(DEVICE_ID_KEY, runtimeContext.deviceId);
    }
  }, [runtimeContext?.deviceId]);

  const value = useMemo(
    () => ({
      outbox,
      enqueueEvent,
      pushNow,
      pullNow,
      canSync,
    }),
    [outbox, enqueueEvent, pushNow, pullNow, canSync],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}

export function getStoredDeviceId() {
  return localStorage.getItem(DEVICE_ID_KEY);
}
