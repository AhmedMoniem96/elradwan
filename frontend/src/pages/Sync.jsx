import React from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
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
    clearFailedEvent,
    canSync,
  } = useSync();

  const hasFailures = failedEvents.length > 0;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            {t('sync_title')}
          </Typography>
          <Typography color="text.secondary">
            {canSync ? t('sync_cashier_ready') : t('sync_cashier_setup_required')}
          </Typography>
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
          <Chip
            color={outbox.length > 0 ? 'warning' : 'success'}
            label={outbox.length > 0 ? t('sync_outbox_pending_action') : t('sync_outbox_clear')}
          />
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
          <Button variant="contained" onClick={pushNow} disabled={!canSync || outbox.length === 0}>
            {t('sync_push_now')}
          </Button>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{ mb: 2 }}
          >
            <Typography variant="h6">{t('sync_failed_events')}</Typography>
            {!hasFailures && <Chip color="success" label={t('sync_no_failed_events')} />}
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {hasFailures ? (
            <Stack spacing={2}>
              {failedEvents.map((event) => (
                <Alert
                  key={`${event.eventId}-${event.failedAt}`}
                  severity="error"
                  action={
                    <Button color="inherit" size="small" onClick={() => clearFailedEvent(event.eventId)}>
                      {t('sync_retry_action')}
                    </Button>
                  }
                >
                  <Typography variant="subtitle2">{event.eventId}</Typography>
                  <Typography variant="body2">
                    {t('sync_failed_reason_label')}: {event.reason}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('sync_failed_at_label')}: {formatDate(event.failedAt)}
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
