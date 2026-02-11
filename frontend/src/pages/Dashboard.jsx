import React, { useEffect, useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric)) return '$0.00';
  return `$${numeric.toFixed(2)}`;
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const toTitle = (value) => (value ? String(value).replace(/_/g, ' ') : '');

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTrendLabel = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const buildDateRange = (days) => {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  end.setHours(23, 59, 59, 999);

  return {
    date_from: dateKey(start),
    date_to: dateKey(end),
  };
};

const normalizeDailySales = (rows, windowDays) => {
  const byDay = new Map((rows || []).map((item) => [item.day, item]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const timeline = [];

  for (let index = windowDays - 1; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - index);
    const key = dateKey(day);
    const source = byDay.get(key);
    timeline.push({
      day: key,
      gross_sales: Number(source?.gross_sales || 0),
      invoice_count: Number(source?.invoice_count || 0),
    });
  }

  return timeline;
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

function TrendChart({
  title,
  points,
  color = 'primary.main',
  yFormatter = (value) => value,
  peakLabel = 'Peak',
}) {
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const width = 100;
  const height = 42;

  const polyline = points
    .map((point, idx) => {
      const x = points.length === 1 ? width / 2 : (idx / (points.length - 1)) * width;
      const y = height - ((point.value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Typography variant="caption" color="text.secondary">
        {peakLabel}: {yFormatter(max)}
      </Typography>
      <Box sx={{ mt: 1.5, mb: 1.5, height: 180, bgcolor: 'action.hover', borderRadius: 2, p: 1.5, color }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
          <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </Box>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography variant="caption" color="text.secondary">{formatTrendLabel(points[0]?.label)}</Typography>
        <Typography variant="caption" color="text.secondary">{formatTrendLabel(points[points.length - 1]?.label)}</Typography>
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
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(true);
  const [recentActivityFailed, setRecentActivityFailed] = useState(false);
  const [trendWindowDays, setTrendWindowDays] = useState(7);
  const [salesSeries, setSalesSeries] = useState([]);
  const [paymentSplitSeries, setPaymentSplitSeries] = useState([]);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

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

    axios
      .get('/api/v1/invoices/recent-activity/')
      .then((res) => {
        if (mounted) {
          setRecentActivity(Array.isArray(res.data) ? res.data : []);
          setRecentActivityFailed(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setRecentActivity([]);
          setRecentActivityFailed(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setRecentActivityLoading(false);
        }
      });

    const { date_from, date_to } = buildDateRange(trendWindowDays);
    const params = new URLSearchParams({ date_from, date_to, timezone }).toString();

    axios
      .get(`/api/v1/reports/daily-sales/?${params}`)
      .then((res) => {
        if (mounted) {
          setSalesSeries(normalizeDailySales(res.data?.results || [], trendWindowDays));
        }
      })
      .catch(() => {
        if (mounted) {
          setSalesSeries(normalizeDailySales([], trendWindowDays));
        }
      });

    axios
      .get(`/api/v1/reports/payment-method-split/?${params}`)
      .then((res) => {
        if (mounted) {
          setPaymentSplitSeries(Array.isArray(res.data?.results) ? res.data.results : []);
        }
      })
      .catch(() => {
        if (mounted) {
          setPaymentSplitSeries([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [timezone, trendWindowDays]);

  const salesTrendData = useMemo(
    () => salesSeries.map((item) => ({ label: item.day, value: item.gross_sales })),
    [salesSeries],
  );

  const invoicesTrendData = useMemo(
    () => salesSeries.map((item) => ({ label: item.day, value: item.invoice_count })),
    [salesSeries],
  );

  const totalSalesInWindow = useMemo(
    () => salesSeries.reduce((sum, item) => sum + Number(item.gross_sales || 0), 0),
    [salesSeries],
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
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Box>
                <Typography variant="h6">{t('dashboard_sales_trend', 'Sales trend')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('dashboard_total_for_window', 'Total for selected window')}: {formatCurrency(totalSalesInWindow)}
                </Typography>
              </Box>
              <TextField
                select
                size="small"
                label={t('dashboard_window', 'Window')}
                value={trendWindowDays}
                onChange={(event) => setTrendWindowDays(Number(event.target.value))}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value={7}>{t('dashboard_last_days', { defaultValue: 'Last {{count}} days', count: 7 })}</MenuItem>
                <MenuItem value={30}>{t('dashboard_last_days', { defaultValue: 'Last {{count}} days', count: 30 })}</MenuItem>
              </TextField>
            </Stack>
          </Paper>
          <TrendChart
            title={t('dashboard_sales_amount_trend', 'Gross sales')}
            points={salesTrendData}
            yFormatter={formatCurrency}
            peakLabel={t('dashboard_peak_value', 'Peak')}
            color="primary.main"
          />
        </Stack>
      </Grid>

      <Grid item xs={12} md={6}>
        <Stack spacing={2}>
          <TrendChart
            title={t('dashboard_invoice_count_trend', 'Invoice count')}
            points={invoicesTrendData}
            yFormatter={(value) => Number(value).toFixed(0)}
            peakLabel={t('dashboard_peak_value', 'Peak')}
            color="secondary.main"
          />
          <MiniHorizontalChart title={t('dashboard_stock_distribution', 'Stock alert distribution')} data={stockAlertsData} />
        </Stack>
      </Grid>

      <Grid item xs={12}>
        <MiniBarChart
          title={t('dashboard_payment_split_window', 'Payment split (selected window)')}
          data={(paymentSplitSeries || []).map((entry) => ({
            label: toTitle(entry.method || t('unknown', 'Unknown')),
            value: Number(entry.amount || 0),
            color: 'info.main',
          }))}
        />
      </Grid>

      <Grid item xs={12}>
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" gutterBottom>{t('recent_transactions')}</Typography>
          {recentActivityLoading ? (
            <Typography color="text.secondary">{t('loading', 'Loading...')}</Typography>
          ) : recentActivity.length === 0 ? (
            <Typography color="text.secondary">
              {recentActivityFailed
                ? t('dashboard_recent_activity_fallback', 'Activity is temporarily unavailable.')
                : t('no_transactions')}
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {recentActivity.map((item, idx) => (
                <Box
                  key={`${item.transaction_type}-${item.reference_number}-${item.timestamp}-${idx}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 0.7fr 0.8fr 1.1fr' },
                    gap: 1,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">
                    {toTitle(item.transaction_type)} • {item.reference_number}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{item.customer || t('walk_in_customer', 'Walk-in')}</Typography>
                  <Typography variant="body2">{formatCurrency(item.amount)}</Typography>
                  <Typography variant="body2" color="text.secondary">{toTitle(item.method_status)}</Typography>
                  <Typography variant="body2" color="text.secondary">{formatTimestamp(item.timestamp)}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Grid>
    </Grid>
  );
}
