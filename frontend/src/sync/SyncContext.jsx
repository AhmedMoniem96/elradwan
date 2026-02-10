import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const SyncContext = createContext(null);

const OUTBOX_KEY = 'sync_outbox_events';
const CURSOR_KEY = 'sync_server_cursor';
const DEVICE_ID_KEY = 'active_device_id';
const LAST_PUSH_SUCCESS_KEY = 'sync_last_push_success';
const LAST_PULL_SUCCESS_KEY = 'sync_last_pull_success';

const ACTIVE_SHIFT_KEY = 'active_shift_summary';

const loadActiveShiftSummary = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_SHIFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

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
const loadTimestamp = (key) => localStorage.getItem(key) || null;
const persistTimestamp = (key, value) => {
  if (value) {
    localStorage.setItem(key, value);
  }
};

export function SyncProvider({ children, runtimeContext, onServerUpdates }) {
  const [outbox, setOutbox] = useState(loadOutbox);
  const [serverCursor, setServerCursor] = useState(loadCursor);
  const [lastPushSuccessAt, setLastPushSuccessAt] = useState(() => loadTimestamp(LAST_PUSH_SUCCESS_KEY));
  const [lastPullSuccessAt, setLastPullSuccessAt] = useState(() => loadTimestamp(LAST_PULL_SUCCESS_KEY));
  const [failedEvents, setFailedEvents] = useState([]);
  const pushInFlight = useRef(false);
  const pullInFlight = useRef(false);

  const updateServerCursor = useCallback((cursor) => {
    persistCursor(cursor);
    setServerCursor(cursor);
  }, []);

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

      if (response.data?.rejected?.length) {
        const failedAt = new Date().toISOString();
        setFailedEvents((prev) => [
          ...response.data.rejected.map((item) => ({
            eventId: item.event_id,
            reason: item.reason || 'rejected',
            failedAt,
          })),
          ...prev,
        ]);
      }

      if (typeof response.data?.server_cursor === 'number') {
        updateServerCursor(response.data.server_cursor);
      }

      const successfulAt = new Date().toISOString();
      setLastPushSuccessAt(successfulAt);
      persistTimestamp(LAST_PUSH_SUCCESS_KEY, successfulAt);
    } catch (error) {
      const reason = error?.response?.data?.detail || error?.message || 'push_failed';
      if (outbox.length > 0) {
        const failedAt = new Date().toISOString();
        setFailedEvents((prev) => [
          ...outbox.slice(0, 50).map((event) => ({
            eventId: event.event_id,
            reason,
            failedAt,
          })),
          ...prev,
        ]);
      }
      console.error('Sync push failed', error);
    } finally {
      pushInFlight.current = false;
    }
  }, [canSync, outbox, runtimeContext, updateServerCursor]);

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

      updateServerCursor(cursor);
      if (allUpdates.length > 0 && onServerUpdates) {
        onServerUpdates(allUpdates);
      }

      const successfulAt = new Date().toISOString();
      setLastPullSuccessAt(successfulAt);
      persistTimestamp(LAST_PULL_SUCCESS_KEY, successfulAt);
    } catch (error) {
      console.error('Sync pull failed', error);
    } finally {
      pullInFlight.current = false;
    }
  }, [canSync, onServerUpdates, runtimeContext, updateServerCursor]);

  const enqueueEvent = useCallback(
    ({ eventType, payload }) => {
      if (!runtimeContext?.deviceId || !runtimeContext?.branchId || !runtimeContext?.userId) {
        throw new Error('Missing runtime sync context (branch/device/user).');
      }

      const activeShift = loadActiveShiftSummary();
      const event = {
        event_id: crypto.randomUUID(),
        event_type: eventType,
        payload: {
          ...payload,
          branch_id: runtimeContext.branchId,
          device_id: runtimeContext.deviceId,
          user_id: runtimeContext.userId,
          shift_summary: activeShift,
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
      serverCursor,
      lastPushSuccessAt,
      lastPullSuccessAt,
      failedEvents,
      enqueueEvent,
      pushNow,
      pullNow,
      clearFailedEvent: (eventId) => {
        setFailedEvents((prev) => prev.filter((item) => item.eventId !== eventId));
      },
      canSync,
    }),
    [outbox, serverCursor, lastPushSuccessAt, lastPullSuccessAt, failedEvents, enqueueEvent, pushNow, pullNow, canSync],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}

export function getStoredDeviceId() {
  return localStorage.getItem(DEVICE_ID_KEY);
}


export function storeActiveShiftSummary(shiftSummary) {
  if (!shiftSummary) {
    localStorage.removeItem(ACTIVE_SHIFT_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_SHIFT_KEY, JSON.stringify(shiftSummary));
}
