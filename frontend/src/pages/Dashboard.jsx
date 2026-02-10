import React, { useEffect, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t } = useTranslation();
  const [shiftSummary, setShiftSummary] = useState({
    active_shift_count: 0,
    expected_cash_total: '0.00',
    variance_total: '0.00',
  });

  useEffect(() => {
    let mounted = true;
    axios
      .get('/api/v1/invoices/dashboard-summary/')
      .then((res) => {
        if (mounted) {
          setShiftSummary(res.data || shiftSummary);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={8} lg={9}>
        <Paper
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 240,
          }}
        >
          <Typography variant="h6" gutterBottom>
            {t('todays_sales')}
          </Typography>
          <Typography component="p" variant="h4">
            ${shiftSummary.expected_cash_total}
          </Typography>
          <Typography color="text.secondary" sx={{ flex: 1 }}>
            {t('active_register')}: {shiftSummary.active_shift_count}
          </Typography>
        </Paper>
      </Grid>
      <Grid item xs={12} md={4} lg={3}>
        <Paper
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 240,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Shift variance
          </Typography>
          <Typography component="p" variant="h4">
            ${shiftSummary.variance_total}
          </Typography>
          <Typography color="text.secondary" sx={{ flex: 1 }}>
            {t('status')}: {t('online')}
          </Typography>
        </Paper>
      </Grid>
      <Grid item xs={12}>
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" gutterBottom>
            {t('recent_transactions')}
          </Typography>
          <Typography>{t('no_transactions')}</Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}
