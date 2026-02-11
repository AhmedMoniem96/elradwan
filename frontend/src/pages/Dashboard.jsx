import React, { useEffect, useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return '$0.00';
  return `$${numeric.toFixed(2)}`;
};

function MiniBarChart({ title, data }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Stack direction="row" spacing={2} alignItems="end" sx={{ minHeight: 170, mt: 1 }}>
        {data.map((item) => (
          <Box key={item.label} sx={{ flex: 1, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">{formatCurrency(item.value)}</Typography>
            <Box
              sx={{
                height: `${Math.max((item.value / max) * 100, item.value > 0 ? 6 : 2)}px`,
                maxHeight: 120,
                minHeight: 2,
                borderRadius: 1,
                bgcolor: item.color,
                mt: 0.5,
              }}
            />
            <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>{item.label}</Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

function MiniHorizontalChart({ title, data }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {data.map((item) => (
          <Box key={item.label}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">{item.label}</Typography>
              <Typography variant="body2" color="text.secondary">{item.value}</Typography>
            </Stack>
            <Box sx={{ mt: 0.5, width: '100%', height: 10, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Box
                sx={{
                  width: `${Math.max((item.value / max) * 100, item.value > 0 ? 5 : 0)}%`,
                  height: '100%',
                  bgcolor: item.color,
                  borderRadius: 1,
                }}
              />
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [shiftSummary, setShiftSummary] = useState({
    active_shift_count: 0,
    expected_cash_total: '0.00',
    variance_total: '0.00',
  });
  const [stockSummary, setStockSummary] = useState({ low_count: 0, critical_count: 0, unread_alert_count: 0 });

  useEffect(() => {
    let mounted = true;
    axios
      .get('/api/v1/invoices/dashboard-summary/')
      .then((res) => {
        if (mounted) {
          setShiftSummary((prev) => ({ ...prev, ...(res.data || {}) }));
        }
      })
      .catch(() => {});

    axios
      .get('/api/v1/stock-intelligence/')
      .then((res) => {
        if (mounted) {
          setStockSummary((prev) => ({ ...prev, ...(res.data || {}) }));
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const salesVsVarianceData = useMemo(
    () => [
      {
        label: t('todays_sales'),
        value: Number(shiftSummary.expected_cash_total || 0),
        color: 'primary.main',
      },
      {
        label: t('dashboard_variance', 'Variance'),
        value: Math.abs(Number(shiftSummary.variance_total || 0)),
        color: 'warning.main',
      },
    ],
    [shiftSummary.expected_cash_total, shiftSummary.variance_total, t],
  );

  const stockAlertsData = useMemo(
    () => [
      { label: t('dashboard_critical_stock', 'Critical'), value: Number(stockSummary.critical_count || 0), color: 'error.main' },
      { label: t('dashboard_low_stock', 'Low'), value: Number(stockSummary.low_count || 0), color: 'warning.main' },
      { label: t('dashboard_unread_alerts', 'Unread'), value: Number(stockSummary.unread_alert_count || 0), color: 'info.main' },
    ],
    [stockSummary.critical_count, stockSummary.low_count, stockSummary.unread_alert_count, t],
  );

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6} lg={4}>
        <Paper sx={{ p: 2, height: 220 }}>
          <Typography variant="h6" gutterBottom>{t('todays_sales')}</Typography>
          <Typography component="p" variant="h4">{formatCurrency(shiftSummary.expected_cash_total)}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {t('active_register')}: {shiftSummary.active_shift_count}
          </Typography>
          <Chip size="small" sx={{ mt: 2 }} label={`${t('dashboard_live_status', 'Live')}: ${t('online')}`} color="success" variant="outlined" />
        </Paper>
      </Grid>

      <Grid item xs={12} md={6} lg={4}>
        <Paper sx={{ p: 2, height: 220 }}>
          <Typography variant="h6" gutterBottom>{t('dashboard_shift_variance', 'Shift variance')}</Typography>
          <Typography component="p" variant="h4">{formatCurrency(shiftSummary.variance_total)}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {t('dashboard_variance_hint', 'Closed-shift cumulative variance')}
          </Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={12} lg={4}>
        <Paper sx={{ p: 2, height: 220 }}>
          <Typography variant="h6" gutterBottom>{t('dashboard_stock_alerts', 'Stock alerts')}</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1, mt: 1 }}>
            <Chip color="error" label={`${t('dashboard_critical_stock', 'Critical')}: ${stockSummary.critical_count}`} />
            <Chip color="warning" label={`${t('dashboard_low_stock', 'Low')}: ${stockSummary.low_count}`} />
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            {t('dashboard_unread_alerts', 'Unread alerts')}: {stockSummary.unread_alert_count}
          </Typography>
        </Paper>
      </Grid>

      <Grid item xs={12} md={6}>
        <MiniBarChart title={t('dashboard_sales_vs_variance', 'Sales vs variance')} data={salesVsVarianceData} />
      </Grid>

      <Grid item xs={12} md={6}>
        <MiniHorizontalChart title={t('dashboard_stock_distribution', 'Stock alert distribution')} data={stockAlertsData} />
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" gutterBottom>{t('recent_transactions')}</Typography>
          <Typography>{t('no_transactions')}</Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}
