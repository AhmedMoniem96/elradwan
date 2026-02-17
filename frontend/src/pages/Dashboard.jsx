import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import Panel from '../components/ui/Panel';
import { useAuth } from '../AuthContext';
import { useSync } from '../sync/SyncContext';
import { PageHeader, PageShell } from '../components/PageLayout';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from '../utils/formatters';

const toTitle = (value) => (value ? String(value).replace(/_/g, ' ') : '');

const dateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value, endOfDay = false) => {
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};

const formatTrendLabel = (value) => {
  if (!value) return '';
  return formatDate(`${value}T00:00:00`);
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

const normalizeDailySales = (rows, dateFrom, dateTo) => {
  const byDay = new Map((rows || []).map((item) => [item.day, item]));
  const start = parseDateKey(dateFrom);
  const end = parseDateKey(dateTo);
  const timeline = [];

  for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
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

const sumRows = (rows, field) => rows.reduce((sum, item) => sum + Number(item?.[field] || 0), 0);

const computeDeltaPct = (current, previous) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
};

const trendFromDelta = (delta) => {
  if (!Number.isFinite(delta)) return 'flat';
  if (delta > 0.01) return 'up';
  if (delta < -0.01) return 'down';
  return 'flat';
};

const getRangeByPreset = (period, customRange) => {
  if (period === 'today') {
    return buildDateRange(1);
  }

  if (period === '7d') {
    return buildDateRange(7);
  }

  if (period === '30d') {
    return buildDateRange(30);
  }

  if (period === 'custom' && customRange.date_from && customRange.date_to) {
    return customRange;
  }

  return buildDateRange(7);
};

const DASHBOARD_PANEL_MIN_HEIGHT = 360;
const ALL_BRANCHES_VALUE = '__all__';

const normalizeBranchParam = (value) => {
  if (!value || value === ALL_BRANCHES_VALUE) {
    return undefined;
  }
  return value;
};


const REPORT_CACHE_TTL_MS = 60 * 1000;
const FILTER_DEBOUNCE_MS = 300;
const NON_CRITICAL_DEFER_MS = 250;
const ALERTS_ACK_KEY = 'dashboard_alerts_acknowledged_v1';

const loadAcknowledgedAlerts = () => {
  try {
    const raw = localStorage.getItem(ALERTS_ACK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

const sortBranchRows = (rows, key, direction) => {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a?.[key];
    const right = b?.[key];

    if (typeof left === 'number' || typeof right === 'number') {
      return (Number(left || 0) - Number(right || 0)) * multiplier;
    }

    return String(left || '').localeCompare(String(right || '')) * multiplier;
  });
};

function MiniHorizontalChart({ title, data, valueFormatter = formatNumber, labelColor = 'text.secondary' }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <Panel compact sx={{ height: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{title}</Typography>
      <Panel compact sx={{ mt: 1.5 }}>
        <Stack spacing={1.5}>
        {data.map((item) => (
          <Box key={item.label}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{item.label}</Typography>
              <Typography variant="body1" sx={{ color: labelColor, fontWeight: 600 }}>{valueFormatter(item.value)}</Typography>
            </Stack>
            <Box sx={{ mt: 0.75, width: '100%', height: 1, bgcolor: 'divider' }}>
              <Box
                sx={{
                  width: `${Math.max((item.value / max) * 100, item.value > 0 ? 5 : 0)}%`,
                  height: 3,
                  bgcolor: item.color,
                  transform: 'translateY(-1px)',
                }}
              />
            </Box>
          </Box>
        ))}
        </Stack>
      </Panel>
    </Panel>
  );
}

const minimalMuiXLineSx = {
  '& .MuiMarkElement-root': { display: 'none' },
  '& .MuiAreaElement-root': { display: 'none' },
  '& .MuiLineElement-root': { strokeWidth: 2 },
};

function TrendChart({
  title,
  points,
  color = 'primary.main',
  yFormatter = (value) => value,
  peakLabel = 'Peak',
  labelColor = 'text.secondary',
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
    <Panel compact sx={{ height: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>{title}</Typography>
      <Typography variant="body2" sx={{ color: labelColor }}>
        {peakLabel}: {yFormatter(max)}
      </Typography>
      <Panel compact sx={{ mt: 1.25, mb: 1.5, height: 128, color, ...minimalMuiXLineSx }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" width="100%" height="100%">
          <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      </Panel>
      <Stack direction="row" justifyContent="space-between" spacing={1}>
        <Typography variant="caption" sx={{ color: labelColor }}>{formatTrendLabel(points[0]?.label)}</Typography>
        <Typography variant="caption" sx={{ color: labelColor }}>{formatTrendLabel(points[points.length - 1]?.label)}</Typography>
      </Stack>
    </Panel>
  );
}

const alertSeverityRank = { critical: 0, high: 1, normal: 2 };

function AlertsCenter({
  t,
  alerts,
  alertCounts,
  lastUpdatedAt,
  onOpenAlert,
  onAcknowledge,
  onMarkInventoryRead,
  onRetryFailedSync,
  onDiscardFailedSync,
}) {
  return (
    <Panel compact>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('dashboard_alerts_center')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('dashboard_alerts_last_updated')}: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '—'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip size="small" color="error" label={`${t('dashboard_critical')}: ${alertCounts.critical}`} />
          <Chip size="small" color="warning" label={`${t('dashboard_high')}: ${alertCounts.high}`} />
          <Chip size="small" color="default" label={`${t('dashboard_normal')}: ${alertCounts.normal}`} />
        </Stack>
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      {alerts.length === 0 ? (
        <EmptyState
          title={t('dashboard_alerts_center_empty_title')}
          helperText={t('dashboard_alerts_center_empty_helper')}
        />
      ) : (
        <Stack spacing={0.75}>
          {alerts.map((alert) => {
            const severityColor = alert.severity === 'critical' ? 'error' : alert.severity === 'high' ? 'warning' : 'default';
            return (
              <Box
                key={alert.id}
                sx={{
                  px: 1.5,
                  py: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1.5,
                  opacity: alert.acknowledgedAt ? 0.8 : 1,
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                  <Stack spacing={0.5} sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip size="small" color={severityColor} label={toTitle(alert.severity)} sx={{ textTransform: 'capitalize' }} />
                      <Chip size="small" variant="outlined" label={alert.categoryLabel} />
                      {!!alert.acknowledgedAt && <Chip size="small" label={t('dashboard_acknowledged')} />}
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{alert.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{alert.description}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('dashboard_alert_created_at')}: {formatDateTime(alert.createdAt)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" onClick={() => onOpenAlert(alert)}>
                      {t('dashboard_open')}
                    </Button>
                    {alert.actions?.includes('markRead') && (
                      <Button size="small" variant="contained" onClick={() => onMarkInventoryRead(alert)}>
                        {t('dashboard_mark_read')}
                      </Button>
                    )}
                    {alert.actions?.includes('retrySync') && (
                      <Button size="small" variant="contained" onClick={() => onRetryFailedSync(alert)}>
                        {t('dashboard_retry')}
                      </Button>
                    )}
                    {alert.actions?.includes('discardSync') && (
                      <Button size="small" variant="outlined" color="warning" onClick={() => onDiscardFailedSync(alert)}>
                        {t('dashboard_discard')}
                      </Button>
                    )}
                    {!alert.acknowledgedAt && (
                      <Button size="small" onClick={() => onAcknowledge(alert.id)}>
                        {t('dashboard_acknowledge')}
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Panel>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, can } = useAuth();
  const {
    failedEvents,
    retryFailedEvent,
    discardFailedEvent,
  } = useSync();
  const navigate = useNavigate();
  const [periodPreset, setPeriodPreset] = useState('today');
  const [customRange, setCustomRange] = useState({ date_from: '', date_to: '' });

  const [shiftSummary, setShiftSummary] = useState({
    active_shift_count: 0,
    expected_cash_total: '0.00',
    variance_total: '0.00',
  });
  const [stockSummary, setStockSummary] = useState({ low_count: 0, critical_count: 0, unread_alert_count: 0 });
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [alertsCenterRefreshNonce, setAlertsCenterRefreshNonce] = useState(0);
  const [alertsCenterLastUpdatedAt, setAlertsCenterLastUpdatedAt] = useState(null);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState(loadAcknowledgedAlerts);
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(true);
  const [recentActivityFailed, setRecentActivityFailed] = useState(false);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiFailed, setKpiFailed] = useState(false);

  const [trendWindowDays, setTrendWindowDays] = useState(7);
  const [salesSeries, setSalesSeries] = useState([]);
  const [salesSeriesLoading, setSalesSeriesLoading] = useState(true);
  const [salesSeriesFailed, setSalesSeriesFailed] = useState(false);
  const [paymentSplitSeries, setPaymentSplitSeries] = useState([]);
  const [paymentSplitLoading, setPaymentSplitLoading] = useState(true);
  const [paymentSplitFailed, setPaymentSplitFailed] = useState(false);

  const [kpiRefreshNonce, setKpiRefreshNonce] = useState(0);
  const [recentActivityRefreshNonce, setRecentActivityRefreshNonce] = useState(0);
  const [salesSeriesRefreshNonce, setSalesSeriesRefreshNonce] = useState(0);
  const [paymentSplitRefreshNonce, setPaymentSplitRefreshNonce] = useState(0);

  const [salesTotals, setSalesTotals] = useState({ current: 0, previous: 0 });
  const [accountsReceivableTotals, setAccountsReceivableTotals] = useState({ current: 0, previous: 0 });
  const [branches, setBranches] = useState([]);
  const [adminBranchRows, setAdminBranchRows] = useState([]);
  const [adminBranchLoading, setAdminBranchLoading] = useState(false);
  const [adminBranchFailed, setAdminBranchFailed] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(ALL_BRANCHES_VALUE);
  const [adminBranchSort, setAdminBranchSort] = useState({ key: 'sales', direction: 'desc' });

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const reportCacheRef = useRef(new Map());

  const reportWidgetFailure = useCallback((widgetName, error, metadata = {}) => {
    console.error(`[dashboard] ${widgetName} widget failed`, {
      message: error?.message,
      status: error?.response?.status,
      metadata,
    });
  }, []);

  const userRole = user?.role || 'cashier';
  const canViewDashboard = can('sales.dashboard.view');
  const canAccessPos = can('sales.pos.access');
  const canViewInventory = can('inventory.view');
  const canCloseSelfShift = can('shift.close.self');
  const canCloseOverride = can('shift.close.override');
  const canApproveQueue = can('supplier.payment.approve');
  const canViewAging = can('sales.customers.view');
  const canViewBranchComparison = can('admin.records.manage') || can('user.manage');

  const activeRange = useMemo(() => getRangeByPreset(periodPreset, customRange), [periodPreset, customRange]);
  const debouncedActiveRange = useDebouncedValue(activeRange, FILTER_DEBOUNCE_MS);
  const debouncedTrendWindowDays = useDebouncedValue(trendWindowDays, FILTER_DEBOUNCE_MS);
  const debouncedSelectedBranchId = useDebouncedValue(selectedBranchId, FILTER_DEBOUNCE_MS);
  const normalizedBranchId = useMemo(() => normalizeBranchParam(debouncedSelectedBranchId), [debouncedSelectedBranchId]);

  const cachedReportGet = useCallback((url, params = {}) => {
    const normalizedParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
    );
    const search = new URLSearchParams(Object.entries(normalizedParams).map(([key, value]) => [key, String(value)])).toString();
    const requestKey = `${url}?${search}`;
    const now = Date.now();
    const cached = reportCacheRef.current.get(requestKey);

    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    const promise = axios.get(url, {
      params: normalizedParams,
      headers: { 'Cache-Control': `max-age=${Math.floor(REPORT_CACHE_TTL_MS / 1000)}` },
    }).then((res) => res.data);

    reportCacheRef.current.set(requestKey, { expiresAt: now + REPORT_CACHE_TTL_MS, promise });
    promise.catch(() => {
      const current = reportCacheRef.current.get(requestKey);
      if (current?.promise === promise) {
        reportCacheRef.current.delete(requestKey);
      }
    });

    return promise;
  }, []);

  useEffect(() => {
    let mounted = true;

    if (periodPreset === 'custom' && (!customRange.date_from || !customRange.date_to)) {
      return () => {
        mounted = false;
      };
    }

    setKpiLoading(true);
    setKpiFailed(false);

    Promise.allSettled([
      axios.get('/api/v1/invoices/dashboard-summary/', { params: { branch_id: normalizedBranchId } }),
      axios.get('/api/v1/stock-intelligence/', { params: { branch_id: normalizedBranchId } }),
      cachedReportGet('/api/v1/reports/dashboard-metrics/', {
        ...debouncedActiveRange,
        timezone,
        branch_id: normalizedBranchId,
      }),
    ])
      .then(([shiftRes, stockRes, metricsRes]) => {
        if (!mounted) return;

        const failedRequests = [];

        if (shiftRes.status === 'fulfilled') {
          setShiftSummary((prev) => ({ ...prev, ...(shiftRes.value.data || {}) }));
        } else {
          failedRequests.push('shiftSummary');
          reportWidgetFailure('kpis.shiftSummary', shiftRes.reason, { activeRange: debouncedActiveRange });
        }

        if (stockRes.status === 'fulfilled') {
          setStockSummary((prev) => ({ ...prev, ...(stockRes.value.data || {}) }));
        } else {
          failedRequests.push('stockSummary');
          reportWidgetFailure('kpis.stockSummary', stockRes.reason, { activeRange: debouncedActiveRange });
        }

        if (metricsRes.status === 'fulfilled') {
          setSalesTotals({
            current: Number(metricsRes.value?.sales_totals?.current || 0),
            previous: Number(metricsRes.value?.sales_totals?.previous || 0),
          });
          setAccountsReceivableTotals({
            current: Number(metricsRes.value?.accounts_receivable_totals?.current || 0),
            previous: Number(metricsRes.value?.accounts_receivable_totals?.previous || 0),
          });
        } else {
          failedRequests.push('dashboardMetrics');
          setSalesTotals({ current: 0, previous: 0 });
          setAccountsReceivableTotals({ current: 0, previous: 0 });
          reportWidgetFailure('kpis.dashboardMetrics', metricsRes.reason, { activeRange: debouncedActiveRange });
        }

        setKpiFailed(failedRequests.length > 0);
      })
      .finally(() => {
        if (mounted) {
          setKpiLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [
    cachedReportGet,
    customRange.date_from,
    customRange.date_to,
    debouncedActiveRange,
    kpiRefreshNonce,
    periodPreset,
    reportWidgetFailure,
    normalizedBranchId,
    timezone,
  ]);


  useEffect(() => {
    localStorage.setItem(ALERTS_ACK_KEY, JSON.stringify(acknowledgedAlerts));
  }, [acknowledgedAlerts]);

  useEffect(() => {
    let mounted = true;

    if (!canViewInventory) {
      setInventoryAlerts([]);
      return () => {
        mounted = false;
      };
    }

    axios
      .get('/api/v1/alerts/', { params: { limit: 100, branch_id: normalizedBranchId } })
      .then((res) => {
        if (!mounted) return;
        const payload = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.results) ? res.data.results : []);
        setInventoryAlerts(payload);
        setAlertsCenterLastUpdatedAt(new Date().toISOString());
      })
      .catch((error) => {
        if (!mounted) return;
        reportWidgetFailure('alertsCenter.inventoryAlerts', error, { activeRange: debouncedActiveRange });
      });

    return () => {
      mounted = false;
    };
  }, [alertsCenterRefreshNonce, canViewInventory, debouncedActiveRange, normalizedBranchId, reportWidgetFailure]);

  useEffect(() => {
    let mounted = true;

    setRecentActivityLoading(true);
    setRecentActivityFailed(false);

    const timer = window.setTimeout(() => {
      axios
        .get('/api/v1/invoices/recent-activity/')
        .then((res) => {
          if (mounted) {
            setRecentActivity(Array.isArray(res.data) ? res.data : []);
            setRecentActivityFailed(false);
          }
        })
        .catch((error) => {
          if (mounted) {
            setRecentActivity([]);
            setRecentActivityFailed(true);
            reportWidgetFailure('recentActivity', error, { activeRange: debouncedActiveRange });
          }
        })
        .finally(() => {
          if (mounted) {
            setRecentActivityLoading(false);
          }
        });
    }, NON_CRITICAL_DEFER_MS);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [debouncedActiveRange, recentActivityRefreshNonce, reportWidgetFailure]);

  useEffect(() => {
    let mounted = true;

    setSalesSeriesLoading(true);
    setSalesSeriesFailed(false);

    const { date_from, date_to } = buildDateRange(debouncedTrendWindowDays);

    cachedReportGet('/api/v1/reports/daily-sales/', { date_from, date_to, timezone, branch_id: normalizedBranchId })
      .then((data) => {
        if (mounted) {
          setSalesSeries(normalizeDailySales(data?.results || [], date_from, date_to));
        }
      })
      .catch((error) => {
        if (mounted) {
          setSalesSeries(normalizeDailySales([], date_from, date_to));
          setSalesSeriesFailed(true);
          reportWidgetFailure('salesTrend', error, {
            trendWindowDays: debouncedTrendWindowDays,
            timezone,
            branchId: normalizedBranchId,
          });
        }
      })
      .finally(() => {
        if (mounted) {
          setSalesSeriesLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [cachedReportGet, debouncedTrendWindowDays, normalizedBranchId, reportWidgetFailure, salesSeriesRefreshNonce, timezone]);

  useEffect(() => {
    let mounted = true;

    setPaymentSplitLoading(true);
    setPaymentSplitFailed(false);

    const { date_from, date_to } = buildDateRange(debouncedTrendWindowDays);

    const timer = window.setTimeout(() => {
      cachedReportGet('/api/v1/reports/payment-method-split/', {
        date_from,
        date_to,
        timezone,
        branch_id: normalizedBranchId,
      })
        .then((data) => {
          if (mounted) {
            setPaymentSplitSeries(Array.isArray(data?.results) ? data.results : []);
          }
        })
        .catch((error) => {
          if (mounted) {
            setPaymentSplitSeries([]);
            setPaymentSplitFailed(true);
            reportWidgetFailure('paymentSplit', error, {
              trendWindowDays: debouncedTrendWindowDays,
              timezone,
              branchId: normalizedBranchId,
            });
          }
        })
        .finally(() => {
          if (mounted) {
            setPaymentSplitLoading(false);
          }
        });
    }, NON_CRITICAL_DEFER_MS);

    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, [cachedReportGet, debouncedTrendWindowDays, normalizedBranchId, paymentSplitRefreshNonce, reportWidgetFailure, timezone]);

  useEffect(() => {
    let mounted = true;

    if (!canViewBranchComparison) {
      return () => {
        mounted = false;
      };
    }

    axios
      .get('/api/v1/branches/')
      .then((res) => {
        if (!mounted) return;
        const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.results) ? res.data.results : []);
        setBranches(list.map((branch) => ({
          id: String(branch.id),
          name: branch.name || branch.code || `${t('branches')} #${branch.id}`,
        })));
      })
      .catch((error) => {
        if (!mounted) return;
        setBranches([]);
        reportWidgetFailure('admin.branches', error);
      });

    return () => {
      mounted = false;
    };
  }, [canViewBranchComparison, reportWidgetFailure, t]);


  useEffect(() => {
    setAlertsCenterLastUpdatedAt(new Date().toISOString());
  }, [failedEvents.length]);

  useEffect(() => {
    let mounted = true;

    if (!canViewBranchComparison || branches.length === 0) {
      setAdminBranchRows([]);
      setAdminBranchLoading(false);
      setAdminBranchFailed(false);
      return () => {
        mounted = false;
      };
    }

    setAdminBranchLoading(true);
    setAdminBranchFailed(false);

    const branchTargets = debouncedSelectedBranchId === ALL_BRANCHES_VALUE
      ? branches
      : branches.filter((branch) => branch.id === debouncedSelectedBranchId);

    if (branchTargets.length === 0) {
      setAdminBranchRows([]);
      setAdminBranchLoading(false);
      return () => {
        mounted = false;
      };
    }

    const alertPromise = axios.get('/api/v1/alerts/', {
      params: {
        limit: 1000,
        branch_id: normalizedBranchId,
      },
    });

    Promise.allSettled(branchTargets.map(async (branch) => {
      const branchQuery = {
        date_from: debouncedActiveRange.date_from,
        date_to: debouncedActiveRange.date_to,
        timezone,
        branch_id: branch.id,
      };

      const [salesData, marginData] = await Promise.all([
        cachedReportGet('/api/v1/reports/daily-sales/', branchQuery),
        cachedReportGet('/api/v1/reports/gross-margin/', branchQuery),
      ]);

      return {
        branch_id: branch.id,
        branch_name: branch.name,
        sales: sumRows(salesData?.results || [], 'gross_sales'),
        margin_pct: Number(marginData?.margin_pct || 0),
      };
    }))
      .then(async (reportResults) => {
        const alertResult = await alertPromise.catch((error) => ({ error }));
        if (!mounted) return;

        const alertsPayload = alertResult?.data;
        const alertRows = Array.isArray(alertsPayload)
          ? alertsPayload
          : (Array.isArray(alertsPayload?.results) ? alertsPayload.results : []);

        const stockoutByBranch = alertRows.reduce((acc, row) => {
          const branchId = String(row.branch || row.branch_id || '');
          if (!branchId) return acc;
          if (debouncedSelectedBranchId !== ALL_BRANCHES_VALUE && branchId !== debouncedSelectedBranchId) return acc;
          acc.set(branchId, (acc.get(branchId) || 0) + 1);
          return acc;
        }, new Map());

        const rows = [];
        let hadFailures = false;
        reportResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') {
            hadFailures = true;
            reportWidgetFailure('admin.branchMetrics', result.reason, { branchId: branchTargets[index].id, activeRange: debouncedActiveRange });
            return;
          }

          rows.push({
            ...result.value,
            stockout_risk_count: Number(stockoutByBranch.get(result.value.branch_id) || 0),
          });
        });

        if (alertResult?.error) {
          hadFailures = true;
          reportWidgetFailure('admin.stockoutRisk', alertResult.error, { selectedBranchId: debouncedSelectedBranchId });
        }

        setAdminBranchRows(rows);
        setAdminBranchFailed(hadFailures);
      })
      .finally(() => {
        if (mounted) {
          setAdminBranchLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [
    cachedReportGet,
    debouncedActiveRange.date_from,
    debouncedActiveRange.date_to,
    branches,
    canViewBranchComparison,
    reportWidgetFailure,
    debouncedSelectedBranchId,
    normalizedBranchId,
    timezone,
  ]);

  const salesTrendData = useMemo(
    () => salesSeries.map((item) => ({ label: item.day, value: item.gross_sales })),
    [salesSeries],
  );

  const invoicesTrendData = useMemo(
    () => salesSeries.map((item) => ({ label: item.day, value: item.invoice_count })),
    [salesSeries],
  );


  const stockAlertsData = useMemo(
    () => [
      { label: t('dashboard_critical_stock'), value: Number(stockSummary.critical_count || 0), color: 'error.main' },
      { label: t('dashboard_low_stock'), value: Number(stockSummary.low_count || 0), color: 'warning.main' },
      { label: t('dashboard_unread_alerts'), value: Number(stockSummary.unread_alert_count || 0), color: 'info.main' },
    ],
    [stockSummary.critical_count, stockSummary.low_count, stockSummary.unread_alert_count, t],
  );

  const adminBranchRanking = useMemo(
    () => [...adminBranchRows].sort((left, right) => right.sales - left.sales).slice(0, 8)
      .map((row) => ({ label: row.branch_name, value: row.sales, color: 'primary.main' })),
    [adminBranchRows],
  );

  const adminBranchMargin = useMemo(
    () => [...adminBranchRows].sort((left, right) => right.margin_pct - left.margin_pct).slice(0, 8)
      .map((row) => ({ label: row.branch_name, value: row.margin_pct, color: 'success.main' })),
    [adminBranchRows],
  );

  const adminBranchStockout = useMemo(
    () => [...adminBranchRows].sort((left, right) => right.stockout_risk_count - left.stockout_risk_count).slice(0, 8)
      .map((row) => ({ label: row.branch_name, value: row.stockout_risk_count, color: 'warning.main' })),
    [adminBranchRows],
  );

  const sortedAdminBranchRows = useMemo(
    () => sortBranchRows(adminBranchRows, adminBranchSort.key, adminBranchSort.direction),
    [adminBranchRows, adminBranchSort.direction, adminBranchSort.key],
  );

  const roleQuickActions = {
    cashier: [
      {
        label: t('dashboard_open_shift'),
        disabled: !canAccessPos,
        onClick: () => navigate('/pos'),
        emphasis: true,
      },
      {
        label: t('dashboard_close_shift'),
        disabled: !canCloseSelfShift,
        onClick: () => navigate('/pos'),
      },
      {
        label: t('dashboard_open_pos'),
        disabled: !canAccessPos,
        onClick: () => navigate('/pos'),
      },
    ],
    supervisor: [
      {
        label: t('dashboard_close_shift'),
        disabled: !canCloseOverride,
        onClick: () => navigate('/pos'),
        emphasis: true,
      },
      {
        label: t('dashboard_view_alerts'),
        disabled: !canViewInventory,
        onClick: () => navigate('/inventory'),
      },
      {
        label: t('dashboard_approval_queue'),
        disabled: !canApproveQueue,
        onClick: () => navigate('/suppliers'),
      },
    ],
    admin: [
      {
        label: t('dashboard_view_alerts'),
        disabled: !canViewInventory,
        onClick: () => navigate('/inventory'),
      },
      {
        label: t('dashboard_create_po'),
        disabled: !canApproveQueue,
        onClick: () => navigate('/suppliers'),
        emphasis: true,
      },
      {
        label: t('dashboard_branch_compare'),
        disabled: !canViewBranchComparison,
        onClick: () => navigate('/reports'),
      },
    ],
  };

  const dashboardQuickActions = roleQuickActions[userRole] || roleQuickActions.cashier;

  const salesDeltaPct = computeDeltaPct(salesTotals.current, salesTotals.previous);
  const receivablesDeltaPct = computeDeltaPct(accountsReceivableTotals.current, accountsReceivableTotals.previous);

  const dashboardKpiCards = [
    {
      id: 'gross-sales',
      value: formatCurrency(salesTotals.current),
      caption: t('dashboard_sales_amount_trend'),
      helper: Number.isFinite(salesDeltaPct)
        ? `${trendFromDelta(salesDeltaPct) === 'down' ? '↓' : trendFromDelta(salesDeltaPct) === 'up' ? '↑' : '→'} ${formatNumber(Math.abs(salesDeltaPct))}%`
        : '—',
    },
    {
      id: 'accounts-receivable',
      value: formatCurrency(accountsReceivableTotals.current),
      caption: t('dashboard_accounts_receivable'),
      helper: Number.isFinite(receivablesDeltaPct)
        ? `${trendFromDelta(receivablesDeltaPct) === 'down' ? '↓' : trendFromDelta(receivablesDeltaPct) === 'up' ? '↑' : '→'} ${formatNumber(Math.abs(receivablesDeltaPct))}%`
        : '—',
    },
    {
      id: 'active-shifts',
      value: formatNumber(shiftSummary.active_shift_count || 0),
      caption: t('dashboard_current_shift_status'),
      helper: t('dashboard_active_shifts'),
    },
    {
      id: 'critical-stock',
      value: formatNumber(stockSummary.critical_count || 0),
      caption: t('dashboard_critical_stock'),
      helper: paymentSplitLoading
        ? t('dashboard_loading_payment_split_title')
        : paymentSplitFailed
          ? t('dashboard_payment_split_error_title')
          : `${t('dashboard_payment_methods')}: ${formatNumber(paymentSplitSeries.length)}`,
    },
  ];

  const hasSalesChartData = !salesSeriesLoading && !salesSeriesFailed && salesTrendData.length > 0;
  const hasInvoicesChartData = !salesSeriesLoading && !salesSeriesFailed && invoicesTrendData.length > 0;
  const showChartsRow = hasSalesChartData || hasInvoicesChartData;



  const reportsQueryParams = useMemo(() => ({
    date_from: activeRange.date_from,
    date_to: activeRange.date_to,
    timezone,
    branch_id: normalizedBranchId,
  }), [activeRange.date_from, activeRange.date_to, normalizedBranchId, timezone]);

  const navigateWithParams = (pathname, params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
    ).toString();
    navigate(query ? `${pathname}?${query}` : pathname);
  };



  const securityNotices = useMemo(
    () => recentActivity
      .filter((item) => {
        const type = String(item.transaction_type || '').toLowerCase();
        return type.includes('audit') || type.includes('security') || type.includes('auth');
      })
      .slice(0, 3)
      .map((item, index) => ({
        id: `notice-${item.reference_number || index}-${item.timestamp || index}`,
        sourceId: item.reference_number,
        type: 'notice',
        severity: 'normal',
        categoryLabel: t('dashboard_security_notice'),
        title: `${toTitle(item.transaction_type) || t('notice')} • ${item.reference_number || '—'}`,
        description: `${item.customer || t('walk_in_customer')} • ${toTitle(item.method_status)}`,
        createdAt: item.timestamp || new Date().toISOString(),
        pathname: '/audit-logs',
        params: { action: 'security', start_date: activeRange.date_from, end_date: activeRange.date_to },
        actions: [],
      })),
    [activeRange.date_from, activeRange.date_to, recentActivity, t],
  );

  const alertsCenterRows = useMemo(() => {
    const inventoryRows = (inventoryAlerts || []).map((alert, index) => {
      const normalizedSeverity = alert.severity === 'critical' ? 'critical' : alert.severity === 'high' ? 'high' : 'normal';
      const branchId = alert.branch || alert.branch_id || '';
      return {
        id: `inventory-${alert.id || index}`,
        sourceId: alert.id,
        type: 'inventory',
        severity: normalizedSeverity,
        categoryLabel: t('dashboard_inventory_alert'),
        title: t('inventory_alert_message', {
          defaultValue: '{{product}} in {{warehouse}} is below threshold',
          product: alert.product_name || t('product'),
          warehouse: alert.warehouse_name || t('warehouse'),
          current: alert.current_quantity ?? 0,
          threshold: alert.threshold_quantity ?? 0,
        }),
        description: `${t('dashboard_branch')}: ${branchId || '—'}`,
        createdAt: alert.created_at || alert.createdAt || new Date().toISOString(),
        pathname: '/inventory',
        params: { severity: normalizedSeverity, branch_id: branchId || undefined },
        actions: ['markRead'],
      };
    });

    const syncRows = (failedEvents || []).slice(0, 20).map((failure) => ({
      id: `sync-${failure.id}`,
      sourceId: failure.id,
      type: 'sync',
      severity: 'high',
      categoryLabel: t('dashboard_sync_failure'),
      title: `${toTitle(failure.eventType)} • ${failure.eventId}`,
      description: `${t('reason')}: ${failure.reasonCode || failure.reason}`,
      createdAt: failure.failedAt || new Date().toISOString(),
      pathname: '/sync',
      params: { reason: failure.reasonCode || failure.reason },
      actions: ['retrySync', 'discardSync'],
    }));

    return [...inventoryRows, ...syncRows, ...securityNotices]
      .map((row) => ({ ...row, acknowledgedAt: acknowledgedAlerts[row.id] || null }))
      .sort((left, right) => {
        const severityDelta = (alertSeverityRank[left.severity] ?? 9) - (alertSeverityRank[right.severity] ?? 9);
        if (severityDelta !== 0) return severityDelta;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      })
      .slice(0, 20);
  }, [acknowledgedAlerts, failedEvents, inventoryAlerts, securityNotices, t]);

  const alertsBySeverity = useMemo(
    () => alertsCenterRows.reduce((acc, row) => {
      acc[row.severity] = (acc[row.severity] || 0) + 1;
      return acc;
    }, { critical: 0, high: 0, normal: 0 }),
    [alertsCenterRows],
  );

  const acknowledgeAlert = useCallback((alertId) => {
    setAcknowledgedAlerts((prev) => ({ ...prev, [alertId]: new Date().toISOString() }));
  }, []);

  const handleMarkInventoryRead = useCallback(async (alert) => {
    if (!alert?.sourceId) return;
    try {
      await axios.post('/api/v1/alerts/mark-read/', { alert_ids: [alert.sourceId] });
      setAcknowledgedAlerts((prev) => ({ ...prev, [alert.id]: new Date().toISOString() }));
      setAlertsCenterRefreshNonce((prev) => prev + 1);
    } catch (error) {
      reportWidgetFailure('alertsCenter.markInventoryRead', error, { alertId: alert.sourceId });
    }
  }, [reportWidgetFailure]);

  const handleRetryFailedSync = useCallback(async (alert) => {
    if (!alert?.sourceId) return;
    try {
      await retryFailedEvent({ failureId: alert.sourceId });
      setAcknowledgedAlerts((prev) => ({ ...prev, [alert.id]: new Date().toISOString() }));
      setAlertsCenterLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      reportWidgetFailure('alertsCenter.retryFailedSync', error, { failureId: alert.sourceId });
    }
  }, [reportWidgetFailure, retryFailedEvent]);

  const handleDiscardFailedSync = useCallback(async (alert) => {
    if (!alert?.sourceId) return;
    try {
      await discardFailedEvent({ failureId: alert.sourceId, reason: 'dashboard_alerts_center' });
      setAcknowledgedAlerts((prev) => ({ ...prev, [alert.id]: new Date().toISOString() }));
      setAlertsCenterLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      reportWidgetFailure('alertsCenter.discardFailedSync', error, { failureId: alert.sourceId });
    }
  }, [discardFailedEvent, reportWidgetFailure]);



  return (
    <PageShell>
      <PageHeader
        title={t('dashboard')}
        subtitle={t('dashboard_subtitle')}
      />
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Panel compact>
          <Stack spacing={2}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} lg={8}>
                <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t('dashboard_welcome_title')}{user?.username ? `, ${user.username}` : ''}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('dashboard_welcome_caption')}
                </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  useFlexGap
                  justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}
                  sx={{ textAlign: { xs: 'start', lg: 'end' } }}
                >
                  <Chip size="small" color="primary" label={`${t('dashboard_role')}: ${toTitle(userRole)}`} />
                  <Chip size="small" label={`${t('dashboard_timezone')}: ${timezone}`} />
                  <Chip size="small" color="info" label={`${t('dashboard_period')}: ${periodPreset.toUpperCase()}`} />
                </Stack>
              </Grid>
            </Grid>

            <Grid container spacing={2} alignItems="flex-end">
              <Grid item xs={12} md={4} lg={3}>
                <TextField
                  select
                  fullWidth
                  size="small"
                  label={t('dashboard_period')}
                  value={periodPreset}
                  onChange={(event) => setPeriodPreset(event.target.value)}
                >
                  <MenuItem value="today">{t('dashboard_period_today')}</MenuItem>
                  <MenuItem value="7d">{t('dashboard_period_7d')}</MenuItem>
                  <MenuItem value="30d">{t('dashboard_period_30d')}</MenuItem>
                  <MenuItem value="custom">{t('dashboard_period_custom')}</MenuItem>
                </TextField>
              </Grid>
              {periodPreset === 'custom' && (
                <>
                  <Grid item xs={12} sm={6} lg={3}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label={t('from')}
                      InputLabelProps={{ shrink: true }}
                      value={customRange.date_from}
                      onChange={(event) => setCustomRange((prev) => ({ ...prev, date_from: event.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} lg={3}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label={t('to')}
                      InputLabelProps={{ shrink: true }}
                      value={customRange.date_to}
                      onChange={(event) => setCustomRange((prev) => ({ ...prev, date_to: event.target.value }))}
                    />
                  </Grid>
                </>
              )}
              <Grid item xs={12} lg>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    textAlign: { xs: 'start', lg: 'end' },
                    marginInlineStart: { xs: 0, lg: 'auto' },
                  }}
                >
                  {t('dashboard_range')}: {formatDate(`${activeRange.date_from}T00:00:00`)} - {formatDate(`${activeRange.date_to}T00:00:00`)}
                </Typography>
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                {dashboardQuickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant={action.emphasis ? 'contained' : 'outlined'}
                    size="small"
                    disabled={action.disabled}
                    onClick={action.onClick}
                    sx={{ fontWeight: 700 }}
                  >
                    {action.label}
                  </Button>
                ))}
              </Stack>
            </Box>
          </Stack>
        </Panel>
      </Grid>

      {kpiFailed && (
        <Grid item xs={12}>
          <ErrorState
            title={t('dashboard_kpis_error_title')}
            helperText={t('dashboard_kpis_error_helper')}
            actionLabel={t('retry')}
            onAction={() => setKpiRefreshNonce((prev) => prev + 1)}
          />
        </Grid>
      )}

      <Grid item xs={12}>
        <Grid container spacing={2}>
          {dashboardKpiCards.map((card) => (
            <Grid key={card.id} item xs={12} sm={6} lg={3}>
              <Panel compact sx={{ height: '100%' }}>
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 700,
                    textAlign: 'end',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {card.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">{card.caption}</Typography>
                <Typography variant="body2" color="text.secondary">{card.helper}</Typography>
              </Panel>
            </Grid>
          ))}
        </Grid>
      </Grid>

      <Grid item xs={12}>
        <AlertsCenter
          t={t}
          alerts={alertsCenterRows}
          alertCounts={alertsBySeverity}
          lastUpdatedAt={alertsCenterLastUpdatedAt}
          onOpenAlert={(alert) => navigateWithParams(alert.pathname, alert.params)}
          onAcknowledge={acknowledgeAlert}
          onMarkInventoryRead={handleMarkInventoryRead}
          onRetryFailedSync={handleRetryFailedSync}
          onDiscardFailedSync={handleDiscardFailedSync}
        />
      </Grid>

      {showChartsRow && (
        <Grid item xs={12}>
          <Grid container spacing={2}>
            {hasSalesChartData && (
              <Grid item xs={12} md={6}>
                <ButtonBase
                  onClick={() => navigateWithParams('/reports', reportsQueryParams)}
                  sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
                >
                  <TrendChart
                    title={t('dashboard_sales_amount_trend')}
                    points={salesTrendData}
                    yFormatter={formatCurrency}
                    peakLabel={t('dashboard_peak_value')}
                    color="primary.main"
                    labelColor={theme.customTokens?.contrast?.chartLabel || 'text.secondary'}
                  />
                </ButtonBase>
              </Grid>
            )}
            {hasInvoicesChartData && (
              <Grid item xs={12} md={6}>
                <ButtonBase
                  onClick={() => navigateWithParams('/reports', reportsQueryParams)}
                  sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
                >
                  <TrendChart
                    title={t('dashboard_invoice_count_trend')}
                    points={invoicesTrendData}
                    yFormatter={formatNumber}
                    peakLabel={t('dashboard_peak_value')}
                    color="secondary.main"
                  />
                </ButtonBase>
              </Grid>
            )}
          </Grid>
        </Grid>
      )}


      {canViewBranchComparison && userRole === 'admin' && (
        <Grid item xs={12}>
          <Panel sx={{ p: (theme) => theme.customSpacing?.panelPaddingDense || 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('dashboard_admin_branch_analytics')}</Typography>
                <TextField
                  select
                  size="small"
                  label={t('branches')}
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                  sx={{ minWidth: 220, marginInlineStart: { md: 'auto' } }}
                >
                  <MenuItem value={ALL_BRANCHES_VALUE}>{t('dashboard_all_branches')}</MenuItem>
                  {branches.map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>{branch.name} ({branch.id})</MenuItem>
                  ))}
                </TextField>
              </Stack>

              {adminBranchLoading ? (
                <LoadingState
                  title={t('dashboard_loading_branch_analytics_title')}
                  helperText={t('dashboard_loading_branch_analytics_helper')}
                />
              ) : adminBranchRows.length === 0 ? (
                <EmptyState
                  title={t('dashboard_branch_analytics_empty_title')}
                  helperText={t('dashboard_branch_analytics_empty_helper')}
                />
              ) : (
                <>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <MiniHorizontalChart
                        title={t('dashboard_branch_sales_ranking')}
                        data={adminBranchRanking}
                        valueFormatter={formatCurrency}
                        labelColor={theme.customTokens?.contrast?.chartLabel || 'text.secondary'}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <MiniHorizontalChart
                        title={t('dashboard_branch_margin_comparison')}
                        data={adminBranchMargin}
                        valueFormatter={(value) => `${formatNumber(value)}%`}
                        labelColor={theme.customTokens?.contrast?.chartLabel || 'text.secondary'}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <MiniHorizontalChart
                        title={t('dashboard_branch_stockout_risk_counts')}
                        data={adminBranchStockout}
                        valueFormatter={formatNumber}
                        labelColor={theme.customTokens?.contrast?.chartLabel || 'text.secondary'}
                      />
                    </Grid>
                  </Grid>

                  <TableContainer sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>
                            <TableSortLabel
                              active={adminBranchSort.key === 'branch_name'}
                              direction={adminBranchSort.key === 'branch_name' ? adminBranchSort.direction : 'asc'}
                              onClick={() => setAdminBranchSort((prev) => ({
                                key: 'branch_name',
                                direction: prev.key === 'branch_name' && prev.direction === 'asc' ? 'desc' : 'asc',
                              }))}
                            >
                              {t('branches')}
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="right">
                            <TableSortLabel
                              active={adminBranchSort.key === 'sales'}
                              direction={adminBranchSort.key === 'sales' ? adminBranchSort.direction : 'desc'}
                              onClick={() => setAdminBranchSort((prev) => ({
                                key: 'sales',
                                direction: prev.key === 'sales' && prev.direction === 'desc' ? 'asc' : 'desc',
                              }))}
                            >
                              {t('dashboard_branch_sales')}
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="right">
                            <TableSortLabel
                              active={adminBranchSort.key === 'margin_pct'}
                              direction={adminBranchSort.key === 'margin_pct' ? adminBranchSort.direction : 'desc'}
                              onClick={() => setAdminBranchSort((prev) => ({
                                key: 'margin_pct',
                                direction: prev.key === 'margin_pct' && prev.direction === 'desc' ? 'asc' : 'desc',
                              }))}
                            >
                              {t('dashboard_margin')}
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="right">
                            <TableSortLabel
                              active={adminBranchSort.key === 'stockout_risk_count'}
                              direction={adminBranchSort.key === 'stockout_risk_count' ? adminBranchSort.direction : 'desc'}
                              onClick={() => setAdminBranchSort((prev) => ({
                                key: 'stockout_risk_count',
                                direction: prev.key === 'stockout_risk_count' && prev.direction === 'desc' ? 'asc' : 'desc',
                              }))}
                            >
                              {t('dashboard_stockout_risk')}
                            </TableSortLabel>
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sortedAdminBranchRows.map((row) => (
                          <TableRow key={row.branch_id}>
                            <TableCell>{row.branch_name} ({row.branch_id})</TableCell>
                            <TableCell align="right">{formatCurrency(row.sales)}</TableCell>
                            <TableCell align="right">{formatNumber(row.margin_pct)}%</TableCell>
                            <TableCell align="right">{formatNumber(row.stockout_risk_count)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {adminBranchFailed && (
                <Typography variant="caption" color="error.main">
                  {t('dashboard_branch_analytics_partial')}
                </Typography>
              )}
            </Stack>
          </Panel>
        </Grid>
      )}

      {(canViewDashboard || canViewAging) && (
      <Grid item xs={12}>
        <Panel compact sx={{ display: 'flex', flexDirection: 'column', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {userRole === 'admin'
                ? t('dashboard_aging_reports')
                : userRole === 'supervisor'
                  ? t('dashboard_shift_exceptions')
                  : t('dashboard_today_transactions')}
            </Typography>
            <Button
              size="small"
              onClick={() => navigateWithParams('/audit-logs', { start_date: activeRange.date_from, end_date: activeRange.date_to })}
            >
              {t('view_all')}
            </Button>
          </Stack>
          {recentActivityLoading ? (
            <LoadingState
              title={t('dashboard_loading_activity_title')}
              helperText={t('dashboard_loading_activity_helper')}
            />
          ) : recentActivityFailed ? (
            <ErrorState
              title={t('dashboard_recent_activity_error_title')}
              helperText={t('dashboard_recent_activity_error_helper')}
              actionLabel={t('retry')}
              onAction={() => setRecentActivityRefreshNonce((prev) => prev + 1)}
            />
          ) : recentActivity.length === 0 ? (
            <EmptyState
              title={t('dashboard_recent_activity_empty_title')}
              helperText={t('dashboard_recent_activity_empty_helper')}
            />
          ) : (
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              {recentActivity.map((item, idx) => (
                <Box
                  key={`${item.transaction_type}-${item.reference_number}-${item.timestamp}-${idx}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 0.7fr 0.8fr 1.1fr' },
                    gap: 1,
                    py: 0.75,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2">
                    {toTitle(item.transaction_type)} • {item.reference_number}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{item.customer || t('walk_in_customer')}</Typography>
                  <Typography variant="body2">{formatCurrency(item.amount)}</Typography>
                  <Typography variant="body2" color="text.secondary">{toTitle(item.method_status)}</Typography>
                  <Typography variant="body2" color="text.secondary">{formatDateTime(item.timestamp)}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Panel>
      </Grid>
      )}
    </Grid>
    </PageShell>
  );
}
