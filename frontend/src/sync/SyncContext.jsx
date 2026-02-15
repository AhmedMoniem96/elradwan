import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

const SyncContext = createContext(null);

const OUTBOX_KEY = 'sync_outbox_events';
const FAILED_EVENTS_KEY = 'sync_failed_events';
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

const loadFailedEvents = () => {
  try {
    const raw = localStorage.getItem(FAILED_EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistOutbox = (events) => {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(events));
};

const persistFailedEvents = (failedEvents) => {
  localStorage.setItem(FAILED_EVENTS_KEY, JSON.stringify(failedEvents));
};

const loadCursor = () => Number(localStorage.getItem(CURSOR_KEY) || 0);
const persistCursor = (cursor) => localStorage.setItem(CURSOR_KEY, String(cursor));
const loadTimestamp = (key) => localStorage.getItem(key) || null;
const persistTimestamp = (key, value) => {
  if (value) {
    localStorage.setItem(key, value);
  }
};

const toFailureEntry = ({ event, rejectedItem, failedAt, retriesCount = 0 }) => ({
  id: crypto.randomUUID(),
  eventId: event?.event_id || rejectedItem?.event_id,
  eventType: event?.event_type || rejectedItem?.event_type || 'unknown',
  payloadSnapshot: event?.payload || rejectedItem?.payload_snapshot || {},
  createdAt: event?.created_at || null,
  failedAt,
  reason: rejectedItem?.reason || rejectedItem?.code || 'rejected',
  reasonCode: rejectedItem?.code || rejectedItem?.reason || 'rejected',
  serverDetails: rejectedItem?.details || {},
  retriesCount,
  lastServerResponseAt: failedAt,
});

export function SyncProvider({ children, runtimeContext, onServerUpdates }) {
  const [outbox, setOutbox] = useState(loadOutbox);
  const [serverCursor, setServerCursor] = useState(loadCursor);
  const [lastPushSuccessAt, setLastPushSuccessAt] = useState(() => loadTimestamp(LAST_PUSH_SUCCESS_KEY));
  const [lastPullSuccessAt, setLastPullSuccessAt] = useState(() => loadTimestamp(LAST_PULL_SUCCESS_KEY));
  const [failedEvents, setFailedEvents] = useState(loadFailedEvents);
  const pushInFlight = useRef(false);
  const pullInFlight = useRef(false);

  const updateServerCursor = useCallback((cursor) => {
    persistCursor(cursor);
    setServerCursor(cursor);
  }, []);

  useEffect(() => {
    persistOutbox(outbox);
  }, [outbox]);

  useEffect(() => {
    persistFailedEvents(failedEvents);
  }, [failedEvents]);

  const canSync = Boolean(runtimeContext?.deviceId && runtimeContext?.branchId && runtimeContext?.userId);

  const logConflictAction = useCallback(
    async ({ action, failure, reason, details, payloadSnapshot }) => {
      if (!runtimeContext?.deviceId) {
        return;
      }
      try {
        await axios.post('/api/v1/sync/conflict-action', {
          device_id: runtimeContext.deviceId,
          action,
          event_id: failure?.eventId,
          event_type: failure?.eventType,
          reason,
          payload_snapshot: payloadSnapshot || failure?.payloadSnapshot,
          details,
        });
      } catch (error) {
        console.error('Failed to write conflict audit log', error);
      }
    },
    [runtimeContext?.deviceId],
  );

  const pushBatch = useCallback(
    async ({ events, validateOnly = false }) => {
      if (!canSync || !events?.length) {
        return null;
      }
      return axios.post('/api/v1/sync/push', {
        device_id: runtimeContext.deviceId,
        events,
        validate_only: validateOnly,
      });
    },
    [canSync, runtimeContext?.deviceId],
  );

  const pushNow = useCallback(async () => {
    if (!canSync || pushInFlight.current || outbox.length === 0) {
      return;
    }

    pushInFlight.current = true;
    try {
      const batch = outbox.slice(0, 50);
      const response = await pushBatch({ events: batch });

      const acknowledged = new Set(response?.data?.acknowledged || []);
      const rejectedItems = response?.data?.rejected || [];
      const rejected = new Set(rejectedItems.map((item) => item.event_id));
      const completed = new Set([...acknowledged, ...rejected]);
      if (completed.size > 0) {
        setOutbox((prev) => prev.filter((event) => !completed.has(event.event_id)));
      }

      if (rejectedItems.length) {
        const failedAt = new Date().toISOString();
        const eventMap = new Map(batch.map((event) => [event.event_id, event]));
        setFailedEvents((prev) => [
          ...rejectedItems.map((item) => toFailureEntry({ event: eventMap.get(item.event_id), rejectedItem: item, failedAt })),
          ...prev,
        ]);
      }

      if (typeof response?.data?.server_cursor === 'number') {
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
          ...outbox.slice(0, 50).map((event) =>
            toFailureEntry({
              event,
              rejectedItem: { reason, code: 'domain_rule_violation', details: error?.response?.data || {} },
              failedAt,
            }),
          ),
          ...prev,
        ]);
      }
      console.error('Sync push failed', error);
    } finally {
      pushInFlight.current = false;
    }
  }, [canSync, outbox, pushBatch, updateServerCursor]);

  const retryFailedEvent = useCallback(
    async ({ failureId, validateOnly = false }) => {
      const failure = failedEvents.find((item) => item.id === failureId);
      if (!failure) {
        return null;
      }

      const event = {
        event_id: failure.eventId,
        event_type: failure.eventType,
        payload: failure.payloadSnapshot,
        created_at: failure.createdAt || new Date().toISOString(),
      };

      const response = await pushBatch({ events: [event], validateOnly });
      const rejected = response?.data?.rejected || [];
      const acknowledged = new Set(response?.data?.acknowledged || []);

      if (acknowledged.has(failure.eventId) && !validateOnly) {
        setFailedEvents((prev) => prev.filter((item) => item.id !== failureId));
      }

      if (rejected.length && !validateOnly) {
        const failedAt = new Date().toISOString();
        setFailedEvents((prev) =>
          prev.map((item) =>
            item.id === failureId
              ? toFailureEntry({
                  event,
                  rejectedItem: rejected[0],
                  failedAt,
                  retriesCount: item.retriesCount + 1,
                })
              : item,
          ),
        );
      }

      await logConflictAction({
        action: 'retry_exact',
        failure,
        reason: rejected[0]?.reason || 'manual_retry',
        details: { validateOnly, response: response?.data || {} },
      });

      return response?.data || null;
    },
    [failedEvents, logConflictAction, pushBatch],
  );

  const cloneAndEditFailedEvent = useCallback(
    async ({ failureId, payloadPatch }) => {
      const failure = failedEvents.find((item) => item.id === failureId);
      if (!failure) {
        return null;
      }

      const clonedEvent = {
        event_id: crypto.randomUUID(),
        event_type: failure.eventType,
        payload: {
          ...failure.payloadSnapshot,
          ...(payloadPatch || {}),
        },
        created_at: new Date().toISOString(),
      };

      setOutbox((prev) => [...prev, clonedEvent]);
      await logConflictAction({
        action: 'clone_edit',
        failure,
        reason: 'manual_clone_edit',
        payloadSnapshot: clonedEvent.payload,
        details: { source_event_id: failure.eventId, new_event_id: clonedEvent.event_id },
      });
      return clonedEvent;
    },
    [failedEvents, logConflictAction],
  );

  const discardFailedEvent = useCallback(
    async ({ failureId, reason }) => {
      const failure = failedEvents.find((item) => item.id === failureId);
      setFailedEvents((prev) => prev.filter((item) => item.id !== failureId));
      if (failure) {
        await logConflictAction({
          action: 'discard',
          failure,
          reason: reason || 'manual_discard',
          details: { discarded_at: new Date().toISOString() },
        });
      }
    },
    [failedEvents, logConflictAction],
  );

  const exportFailureLog = useCallback(() => {
    const blob = new Blob([JSON.stringify(failedEvents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sync-failure-log-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [failedEvents]);

  const bulkRetryFailedEvents = useCallback(
    async (failureIds) => {
      for (const failureId of failureIds) {
        await retryFailedEvent({ failureId });
      }
    },
    [retryFailedEvent],
  );

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
      retryFailedEvent,
      cloneAndEditFailedEvent,
      discardFailedEvent,
      exportFailureLog,
      bulkRetryFailedEvents,
      canSync,
    }),
    [
      outbox,
      serverCursor,
      lastPushSuccessAt,
      lastPullSuccessAt,
      failedEvents,
      enqueueEvent,
      pushNow,
      pullNow,
      retryFailedEvent,
      cloneAndEditFailedEvent,
      discardFailedEvent,
      exportFailureLog,
      bulkRetryFailedEvents,
      canSync,
    ],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}

export function getStoredDeviceId() {
  return localStorage.getItem(DEVICE_ID_KEY);
}
