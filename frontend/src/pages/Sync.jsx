import React, { useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { useTranslation } from 'react-i18next';
import { useSync } from '../sync/SyncContext';

const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString();
};

export default function Sync() {
  const { t } = useTranslation();
  const {
    outbox,
    serverCursor,
    lastPushSuccessAt,
    lastPullSuccessAt,
    failedEvents,
    pushNow,
    retryFailedEvent,
    cloneAndEditFailedEvent,
    discardFailedEvent,
    exportFailureLog,
    bulkRetryFailedEvents,
    canSync,
  } = useSync();

  const [reasonFilter, setReasonFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState([]);

  const reasonOptions = useMemo(() => ['all', ...new Set(failedEvents.map((item) => item.reasonCode || item.reason))], [failedEvents]);
  const typeOptions = useMemo(() => ['all', ...new Set(failedEvents.map((item) => item.eventType))], [failedEvents]);

  const filteredFailures = useMemo(() => {
    return failedEvents.filter((item) => {
      const failedTs = new Date(item.failedAt).getTime();
      const fromTs = fromDate ? new Date(fromDate).getTime() : null;
      const toTs = toDate ? new Date(toDate).getTime() : null;
      const reasonMatch = reasonFilter === 'all' || (item.reasonCode || item.reason) === reasonFilter;
      const typeMatch = typeFilter === 'all' || item.eventType === typeFilter;
      const fromMatch = fromTs === null || failedTs >= fromTs;
      const toMatch = toTs === null || failedTs <= toTs + 86400000;
      return reasonMatch && typeMatch && fromMatch && toMatch;
    });
  }, [failedEvents, fromDate, reasonFilter, toDate, typeFilter]);

  const toggleSelected = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const hasFailures = filteredFailures.length > 0;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            {t('sync_title')}
          </Typography>
          <Typography color="text.secondary">{canSync ? t('sync_cashier_ready') : t('sync_cashier_setup_required')}</Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3, height: '100%' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('sync_pending_outbox')}
          </Typography>
          <Typography variant="h4" sx={{ mb: 2 }}>
            {outbox.length}
          </Typography>
          <Chip color={outbox.length > 0 ? 'warning' : 'success'} label={outbox.length > 0 ? t('sync_outbox_pending_action') : t('sync_outbox_clear')} />
        </Paper>
      </Grid>

      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3, height: '100%' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('sync_last_push')}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {formatDate(lastPushSuccessAt)}
          </Typography>

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('sync_last_pull')}
          </Typography>
          <Typography variant="body1">{formatDate(lastPullSuccessAt)}</Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={4}>
        <Paper sx={{ p: 3, height: '100%' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {t('sync_server_cursor')}
          </Typography>
          <Typography variant="h5" sx={{ mb: 2 }}>
            {serverCursor}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={pushNow} disabled={!canSync || outbox.length === 0}>
              {t('sync_push_now')}
            </Button>
            <Button variant="outlined" onClick={exportFailureLog} disabled={failedEvents.length === 0}>
              Export failures
            </Button>
          </Stack>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 2 }}>
            <Typography variant="h6">{t('sync_failed_events')}</Typography>
            {!hasFailures && <Chip color="success" label={t('sync_no_failed_events')} />}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField select label="Reason" value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} SelectProps={{ native: true }}>
              {reasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </TextField>
            <TextField select label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} SelectProps={{ native: true }}>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </TextField>
            <TextField type="date" label="From" InputLabelProps={{ shrink: true }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <TextField type="date" label="To" InputLabelProps={{ shrink: true }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Button variant="outlined" disabled={selected.length === 0} onClick={() => bulkRetryFailedEvents(selected)}>
              Bulk retry ({selected.length})
            </Button>
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {hasFailures ? (
            <Stack spacing={2}>
              {filteredFailures.map((event) => (
                <Alert
                  key={`${event.id}-${event.failedAt}`}
                  severity="error"
                  action={
                    <Stack direction="row" spacing={1}>
                      <Button color="inherit" size="small" onClick={() => retryFailedEvent({ failureId: event.id })}>
                        Retry
                      </Button>
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => {
                          const raw = window.prompt('Enter replacement payload JSON', JSON.stringify(event.payloadSnapshot, null, 2));
                          if (!raw) return;
                          try {
                            cloneAndEditFailedEvent({ failureId: event.id, payloadPatch: JSON.parse(raw) });
                          } catch {
                            window.alert('Invalid JSON payload');
                          }
                        }}
                      >
                        Clone + Edit
                      </Button>
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => {
                          const reason = window.prompt('Discard reason');
                          discardFailedEvent({ failureId: event.id, reason });
                        }}
                      >
                        Discard
                      </Button>
                    </Stack>
                  }
                >
                  <FormControlLabel control={<Checkbox checked={selected.includes(event.id)} onChange={() => toggleSelected(event.id)} />} label="Select" />
                  <Typography variant="subtitle2">
                    {event.eventType} · {event.eventId}
                  </Typography>
                  <Typography variant="body2">Reason: {event.reasonCode || event.reason}</Typography>
                  <Typography variant="body2">Retries: {event.retriesCount}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Failed at: {formatDate(event.failedAt)}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    Server details: {JSON.stringify(event.serverDetails || {})}
                  </Typography>
                </Alert>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary">{t('sync_actionable_status_message')}</Typography>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
}
