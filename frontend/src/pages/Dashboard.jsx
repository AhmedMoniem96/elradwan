import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
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
import KpiCard from '../components/KpiCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../AuthContext';
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

const getPreviousEquivalentRange = (range) => {
  const currentStart = parseDateKey(range.date_from);
  const currentEnd = parseDateKey(range.date_to, true);
  const spanMs = currentEnd.getTime() - currentStart.getTime() + 1;

  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - spanMs + 1);

  return {
    date_from: dateKey(previousStart),
    date_to: dateKey(previousEnd),
  };
};

const DASHBOARD_PANEL_MIN_HEIGHT = 290;
const ALL_BRANCHES_VALUE = '__all__';

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

function MiniBarChart({ title, data }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <Paper sx={{ p: 2, height: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
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

function MiniHorizontalChart({ title, data, valueFormatter = formatNumber }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <Paper sx={{ p: 2, height: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {data.map((item) => (
          <Box key={item.label}>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">{item.label}</Typography>
              <Typography variant="body2" color="text.secondary">{valueFormatter(item.value)}</Typography>
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
    <Paper sx={{ p: 2, height: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
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

function QuickActions({ title, actions }) {
  return (
    <Paper sx={{ p: 2, minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
      <Typography variant="subtitle1" gutterBottom>{title}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
        {actions.map((action) => (
          <Button key={action.label} variant="outlined" size="small" disabled={action.disabled}>
            {action.label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <Paper sx={{ p: 2, height: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
      <Typography variant="h6">{title}</Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
      )}
      <Box sx={{ mt: 1.5 }}>
        {children}
      </Box>
    </Paper>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [periodPreset, setPeriodPreset] = useState('today');
  const [customRange, setCustomRange] = useState({ date_from: '', date_to: '' });

  const [shiftSummary, setShiftSummary] = useState({
    active_shift_count: 0,
    expected_cash_total: '0.00',
    variance_total: '0.00',
  });
  const [stockSummary, setStockSummary] = useState({ low_count: 0, critical_count: 0, unread_alert_count: 0 });
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

  const reportWidgetFailure = useCallback((widgetName, error, metadata = {}) => {
    console.error(`[dashboard] ${widgetName} widget failed`, {
      message: error?.message,
      status: error?.response?.status,
      metadata,
    });
  }, []);

  const activeRange = useMemo(() => getRangeByPreset(periodPreset, customRange), [periodPreset, customRange]);

  useEffect(() => {
    let mounted = true;

    if (periodPreset === 'custom' && (!customRange.date_from || !customRange.date_to)) {
      return () => {
        mounted = false;
      };
    }

    setKpiLoading(true);
    setKpiFailed(false);

    const previousRange = getPreviousEquivalentRange(activeRange);
    const currentParams = new URLSearchParams({ ...activeRange, timezone }).toString();
    const previousParams = new URLSearchParams({ ...previousRange, timezone }).toString();

    Promise.allSettled([
      axios.get('/api/v1/invoices/dashboard-summary/'),
      axios.get('/api/v1/stock-intelligence/'),
      axios.get(`/api/v1/reports/daily-sales/?${currentParams}`),
      axios.get(`/api/v1/reports/daily-sales/?${previousParams}`),
      axios.get(`/api/v1/reports/accounts-receivable/?${currentParams}`),
      axios.get(`/api/v1/reports/accounts-receivable/?${previousParams}`),
    ])
      .then(([shiftRes, stockRes, salesCurrentRes, salesPreviousRes, arCurrentRes, arPreviousRes]) => {
        if (!mounted) return;

        const failedRequests = [];

        if (shiftRes.status === 'fulfilled') {
          setShiftSummary((prev) => ({ ...prev, ...(shiftRes.value.data || {}) }));
        } else {
          failedRequests.push('shiftSummary');
          reportWidgetFailure('kpis.shiftSummary', shiftRes.reason, { activeRange });
        }

        if (stockRes.status === 'fulfilled') {
          setStockSummary((prev) => ({ ...prev, ...(stockRes.value.data || {}) }));
        } else {
          failedRequests.push('stockSummary');
          reportWidgetFailure('kpis.stockSummary', stockRes.reason, { activeRange });
        }

        if (salesCurrentRes.status === 'fulfilled' && salesPreviousRes.status === 'fulfilled') {
          const currentSales = sumRows(salesCurrentRes.value.data?.results || [], 'gross_sales');
          const previousSales = sumRows(salesPreviousRes.value.data?.results || [], 'gross_sales');
          setSalesTotals({ current: currentSales, previous: previousSales });
        } else {
          failedRequests.push('salesTotals');
          setSalesTotals({ current: 0, previous: 0 });
          if (salesCurrentRes.status === 'rejected') {
            reportWidgetFailure('kpis.salesTotals.current', salesCurrentRes.reason, { activeRange });
          }
          if (salesPreviousRes.status === 'rejected') {
            reportWidgetFailure('kpis.salesTotals.previous', salesPreviousRes.reason, { previousRange });
          }
        }

        if (arCurrentRes.status === 'fulfilled' && arPreviousRes.status === 'fulfilled') {
          const currentAr = sumRows(arCurrentRes.value.data?.results || [], 'balance_due');
          const previousAr = sumRows(arPreviousRes.value.data?.results || [], 'balance_due');
          setAccountsReceivableTotals({ current: currentAr, previous: previousAr });
        } else {
          failedRequests.push('accountsReceivableTotals');
          setAccountsReceivableTotals({ current: 0, previous: 0 });
          if (arCurrentRes.status === 'rejected') {
            reportWidgetFailure('kpis.accountsReceivable.current', arCurrentRes.reason, { activeRange });
          }
          if (arPreviousRes.status === 'rejected') {
            reportWidgetFailure('kpis.accountsReceivable.previous', arPreviousRes.reason, { previousRange });
          }
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
    activeRange,
    customRange.date_from,
    customRange.date_to,
    kpiRefreshNonce,
    periodPreset,
    reportWidgetFailure,
    timezone,
  ]);

  useEffect(() => {
    let mounted = true;

    setRecentActivityLoading(true);
    setRecentActivityFailed(false);

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
          reportWidgetFailure('recentActivity', error, { activeRange });
        }
      })
      .finally(() => {
        if (mounted) {
          setRecentActivityLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeRange, recentActivityRefreshNonce, reportWidgetFailure]);

  useEffect(() => {
    let mounted = true;

    setSalesSeriesLoading(true);
    setSalesSeriesFailed(false);

    const { date_from, date_to } = buildDateRange(trendWindowDays);
    const params = new URLSearchParams({ date_from, date_to, timezone }).toString();

    axios
      .get(`/api/v1/reports/daily-sales/?${params}`)
      .then((res) => {
        if (mounted) {
          setSalesSeries(normalizeDailySales(res.data?.results || [], date_from, date_to));
        }
      })
      .catch((error) => {
        if (mounted) {
          setSalesSeries(normalizeDailySales([], date_from, date_to));
          setSalesSeriesFailed(true);
          reportWidgetFailure('salesTrend', error, { trendWindowDays, timezone });
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
  }, [reportWidgetFailure, salesSeriesRefreshNonce, timezone, trendWindowDays]);

  useEffect(() => {
    let mounted = true;

    setPaymentSplitLoading(true);
    setPaymentSplitFailed(false);

    const { date_from, date_to } = buildDateRange(trendWindowDays);
    const params = new URLSearchParams({ date_from, date_to, timezone }).toString();

    axios
      .get(`/api/v1/reports/payment-method-split/?${params}`)
      .then((res) => {
        if (mounted) {
          setPaymentSplitSeries(Array.isArray(res.data?.results) ? res.data.results : []);
        }
      })
      .catch((error) => {
        if (mounted) {
          setPaymentSplitSeries([]);
          setPaymentSplitFailed(true);
          reportWidgetFailure('paymentSplit', error, { trendWindowDays, timezone });
        }
      })
      .finally(() => {
        if (mounted) {
          setPaymentSplitLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [paymentSplitRefreshNonce, reportWidgetFailure, timezone, trendWindowDays]);

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
          name: branch.name || branch.code || `${t('branches', 'Branches')} #${branch.id}`,
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

    const branchTargets = selectedBranchId === ALL_BRANCHES_VALUE
      ? branches
      : branches.filter((branch) => branch.id === selectedBranchId);

    if (branchTargets.length === 0) {
      setAdminBranchRows([]);
      setAdminBranchLoading(false);
      return () => {
        mounted = false;
      };
    }

    const alertQuery = new URLSearchParams({ limit: '1000' }).toString();
    const alertPromise = axios.get(`/api/v1/inventory-alerts/?${alertQuery}`);

    Promise.allSettled(branchTargets.map(async (branch) => {
      const branchQuery = new URLSearchParams({
        date_from: activeRange.date_from,
        date_to: activeRange.date_to,
        timezone,
        branch_id: branch.id,
      }).toString();

      const [salesRes, marginRes] = await Promise.all([
        axios.get(`/api/v1/reports/daily-sales/?${branchQuery}`),
        axios.get(`/api/v1/reports/gross-margin/?${branchQuery}`),
      ]);

      return {
        branch_id: branch.id,
        branch_name: branch.name,
        sales: sumRows(salesRes.data?.results || [], 'gross_sales'),
        margin_pct: Number(marginRes.data?.margin_pct || 0),
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
          if (selectedBranchId !== ALL_BRANCHES_VALUE && branchId !== selectedBranchId) return acc;
          acc.set(branchId, (acc.get(branchId) || 0) + 1);
          return acc;
        }, new Map());

        const rows = [];
        let hadFailures = false;
        reportResults.forEach((result, index) => {
          if (result.status !== 'fulfilled') {
            hadFailures = true;
            reportWidgetFailure('admin.branchMetrics', result.reason, { branchId: branchTargets[index].id, activeRange });
            return;
          }

          rows.push({
            ...result.value,
            stockout_risk_count: Number(stockoutByBranch.get(result.value.branch_id) || 0),
          });
        });

        if (alertResult?.error) {
          hadFailures = true;
          reportWidgetFailure('admin.stockoutRisk', alertResult.error, { selectedBranchId });
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
    activeRange.date_from,
    activeRange.date_to,
    branches,
    canViewBranchComparison,
    reportWidgetFailure,
    selectedBranchId,
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

  const salesDelta = computeDeltaPct(salesTotals.current, salesTotals.previous);
  const arDelta = computeDeltaPct(accountsReceivableTotals.current, accountsReceivableTotals.previous);
  const userRole = user?.role || 'cashier';
  const canViewDashboard = can('sales.dashboard.view');
  const canAccessPos = can('sales.pos.access');
  const canViewInventory = can('inventory.view');
  const canCloseSelfShift = can('shift.close.self');
  const canCloseOverride = can('shift.close.override');
  const canApproveQueue = can('supplier.payment.approve');
  const canViewAging = can('sales.customers.view');
  const canViewBranchComparison = can('admin.records.manage') || can('user.manage');

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

  const kpis = [
    {
      key: 'sales',
      title: t('todays_sales', 'Sales'),
      value: formatCurrency(salesTotals.current),
      deltaPct: salesDelta,
      trend: trendFromDelta(salesDelta),
    },
    {
      key: 'openShifts',
      title: t('active_register', 'Open shifts'),
      value: formatNumber(shiftSummary.active_shift_count || 0),
      deltaPct: null,
      trend: 'flat',
    },
    {
      key: 'stockAlerts',
      title: t('dashboard_stock_alerts', 'Low / critical alerts'),
      value: `${formatNumber(stockSummary.low_count || 0)} / ${formatNumber(stockSummary.critical_count || 0)}`,
      deltaPct: null,
      trend: 'flat',
    },
    {
      key: 'accountsReceivable',
      title: t('dashboard_accounts_receivable', 'Accounts receivable'),
      value: formatCurrency(accountsReceivableTotals.current),
      deltaPct: arDelta,
      trend: trendFromDelta(arDelta),
    },
    {
      key: 'shiftVariance',
      title: t('dashboard_shift_variance', 'Cash variance'),
      value: formatCurrency(shiftSummary.variance_total),
      deltaPct: null,
      trend: 'flat',
    },
  ];

  const roleQuickActions = {
    cashier: [
      { label: t('dashboard_open_shift', 'Open Shift'), disabled: !canViewDashboard },
      { label: t('dashboard_close_shift', 'Close Shift'), disabled: !canCloseSelfShift },
      { label: t('dashboard_open_pos', 'Open POS'), disabled: !canAccessPos },
    ],
    supervisor: [
      { label: t('dashboard_close_shift', 'Close Shift'), disabled: !canCloseOverride },
      { label: t('dashboard_view_alerts', 'View Alerts'), disabled: !canViewInventory },
      { label: t('dashboard_approval_queue', 'Approval Queue'), disabled: !canApproveQueue },
    ],
    admin: [
      { label: t('dashboard_view_alerts', 'View Alerts'), disabled: !canViewInventory },
      { label: t('dashboard_create_po', 'Create PO'), disabled: !canApproveQueue },
      { label: t('dashboard_branch_compare', 'Branch Comparison'), disabled: !canViewBranchComparison },
    ],
  };


  const reportsQueryParams = useMemo(() => ({
    date_from: activeRange.date_from,
    date_to: activeRange.date_to,
    timezone,
  }), [activeRange.date_from, activeRange.date_to, timezone]);

  const navigateWithParams = (pathname, params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
    ).toString();
    navigate(query ? `${pathname}?${query}` : pathname);
  };

  const kpiNavigation = {
    sales: { pathname: '/reports', params: reportsQueryParams },
    openShifts: { pathname: '/audit-logs', params: { start_date: activeRange.date_from, end_date: activeRange.date_to } },
    stockAlerts: { pathname: '/inventory', params: { severity: 'critical' } },
    accountsReceivable: { pathname: '/reports', params: reportsQueryParams },
    shiftVariance: { pathname: '/audit-logs', params: { action: 'shift' } },
  };

  const visibleKpis = useMemo(() => {
    if (!canViewDashboard) return [];

    if (userRole === 'cashier') {
      return kpis.filter((item) => ['sales', 'openShifts', 'shiftVariance'].includes(item.key));
    }

    if (userRole === 'supervisor') {
      return kpis.filter((item) => item.key !== 'accountsReceivable');
    }

    return kpis;
  }, [canViewDashboard, kpis, userRole]);

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ minWidth: 130 }}>
              {t('dashboard_period', 'Period')}
            </Typography>
            <TextField
              select
              size="small"
              value={periodPreset}
              onChange={(event) => setPeriodPreset(event.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="today">{t('dashboard_period_today', 'Today')}</MenuItem>
              <MenuItem value="7d">{t('dashboard_period_7d', 'Last 7 days')}</MenuItem>
              <MenuItem value="30d">{t('dashboard_period_30d', 'Last 30 days')}</MenuItem>
              <MenuItem value="custom">{t('dashboard_period_custom', 'Custom range')}</MenuItem>
            </TextField>
            {periodPreset === 'custom' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  type="date"
                  label={t('from', 'From')}
                  InputLabelProps={{ shrink: true }}
                  value={customRange.date_from}
                  onChange={(event) => setCustomRange((prev) => ({ ...prev, date_from: event.target.value }))}
                />
                <TextField
                  size="small"
                  type="date"
                  label={t('to', 'To')}
                  InputLabelProps={{ shrink: true }}
                  value={customRange.date_to}
                  onChange={(event) => setCustomRange((prev) => ({ ...prev, date_to: event.target.value }))}
                />
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ marginInlineStart: 'auto' }}>
              {t('dashboard_range', 'Range')}: {formatDate(`${activeRange.date_from}T00:00:00`)} - {formatDate(`${activeRange.date_to}T00:00:00`)}
            </Typography>
          </Stack>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <QuickActions
          title={t('dashboard_quick_actions', 'Quick actions')}
          actions={roleQuickActions[userRole] || roleQuickActions.cashier}
        />
      </Grid>

      {visibleKpis.map((kpi) => (
        <Grid key={kpi.key} item xs={12} sm={6} lg={3} xl={2}>
          <ButtonBase
            onClick={() => {
              const target = kpiNavigation[kpi.key];
              if (target) navigateWithParams(target.pathname, target.params);
            }}
            sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
          >
            <KpiCard
              title={kpi.title}
              value={kpi.value}
              deltaPct={kpi.deltaPct}
              trend={kpi.trend}
              loading={kpiLoading}
            />
          </ButtonBase>
        </Grid>
      ))}

      {kpiFailed && (
        <Grid item xs={12}>
          <ErrorState
            title={t('dashboard_kpis_error_title', 'Some KPI cards are unavailable')}
            helperText={t('dashboard_kpis_error_helper', 'Parts of the summary did not load. You can retry without leaving the page.')}
            actionLabel={t('retry', 'Retry')}
            onAction={() => setKpiRefreshNonce((prev) => prev + 1)}
          />
        </Grid>
      )}

      {(userRole === 'cashier' || userRole === 'supervisor' || userRole === 'admin') && canViewDashboard && (
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            <SectionCard
              title={
                userRole === 'cashier'
                  ? t('dashboard_current_shift_status', 'Current shift status')
                  : userRole === 'supervisor'
                    ? t('dashboard_shift_exceptions', 'Shift exceptions')
                    : t('dashboard_financial_kpis', 'Financial KPIs')
              }
              subtitle={t('dashboard_total_for_window', 'Total for selected window')}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {formatCurrency(totalSalesInWindow)}
                </Typography>
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
            </SectionCard>
            <ButtonBase
              onClick={() => navigateWithParams('/reports', reportsQueryParams)}
              sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
            >
              {salesSeriesLoading ? (
                <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                  <LoadingState
                    title={t('dashboard_loading_sales_trend_title', 'Loading sales trend')}
                    helperText={t('dashboard_loading_sales_trend_helper', 'We are preparing the chart for your selected window.')}
                  />
                </Paper>
              ) : salesSeriesFailed ? (
                <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                  <ErrorState
                    title={t('dashboard_sales_trend_error_title', 'Sales trend is unavailable')}
                    helperText={t('dashboard_sales_trend_error_helper', 'Could not load gross sales trend right now. Please retry.')}
                    actionLabel={t('retry', 'Retry')}
                    onAction={() => setSalesSeriesRefreshNonce((prev) => prev + 1)}
                  />
                </Paper>
              ) : salesTrendData.length === 0 ? (
                <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                  <EmptyState
                    title={t('dashboard_sales_trend_empty_title', 'No sales trend data yet')}
                    helperText={t('dashboard_sales_trend_empty_helper', 'Try a different period or wait for new activity to appear.')}
                  />
                </Paper>
              ) : (
                <TrendChart
                  title={t('dashboard_sales_amount_trend', 'Gross sales')}
                  points={salesTrendData}
                  yFormatter={formatCurrency}
                  peakLabel={t('dashboard_peak_value', 'Peak')}
                  color="primary.main"
                />
              )}
            </ButtonBase>
          </Stack>
        </Grid>
      )}

      {canViewDashboard && (
        <Grid item xs={12} md={6}>
          <Stack spacing={2}>
            {(userRole !== 'cashier' || canViewInventory) && (
              <ButtonBase
                onClick={() => navigateWithParams('/reports', reportsQueryParams)}
                sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
              >
                {salesSeriesLoading ? (
                  <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                    <LoadingState
                      title={t('dashboard_loading_invoice_trend_title', 'Loading invoice trend')}
                      helperText={t('dashboard_loading_invoice_trend_helper', 'Please wait while invoice counts are calculated.')}
                    />
                  </Paper>
                ) : salesSeriesFailed ? (
                  <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                    <ErrorState
                      title={t('dashboard_invoice_trend_error_title', 'Invoice trend is unavailable')}
                      helperText={t('dashboard_invoice_trend_error_helper', 'We could not load invoice trend data. Retry to continue.')}
                      actionLabel={t('retry', 'Retry')}
                      onAction={() => setSalesSeriesRefreshNonce((prev) => prev + 1)}
                    />
                  </Paper>
                ) : invoicesTrendData.length === 0 ? (
                  <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                    <EmptyState
                      title={t('dashboard_invoice_trend_empty_title', 'No invoice trend data')}
                      helperText={t('dashboard_invoice_trend_empty_helper', 'Invoice counts will show here once transactions are recorded.')}
                    />
                  </Paper>
                ) : (
                  <TrendChart
                    title={t('dashboard_invoice_count_trend', 'Invoice count')}
                    points={invoicesTrendData}
                    yFormatter={formatNumber}
                    peakLabel={t('dashboard_peak_value', 'Peak')}
                    color="secondary.main"
                  />
                )}
              </ButtonBase>
            )}
            {canViewInventory && (
              <ButtonBase
                onClick={() => navigateWithParams('/inventory', { severity: 'critical' })}
                sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
              >
                {kpiLoading ? (
                  <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                    <LoadingState
                      title={t('dashboard_loading_stock_title', 'Loading stock alerts')}
                      helperText={t('dashboard_loading_stock_helper', 'Fetching latest low and critical stock signals.')}
                    />
                  </Paper>
                ) : stockAlertsData.every((item) => Number(item.value || 0) === 0) ? (
                  <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                    <EmptyState
                      title={t('dashboard_stock_empty_title', 'No stock alerts right now')}
                      helperText={t('dashboard_stock_empty_helper', 'Great news—no low or critical stock alerts were found.')}
                    />
                  </Paper>
                ) : (
                  <MiniHorizontalChart
                    title={
                      userRole === 'supervisor'
                        ? t('dashboard_low_stock_hotspots', 'Low-stock hotspots')
                        : t('dashboard_stock_distribution', 'Stock alert distribution')
                    }
                    data={stockAlertsData}
                  />
                )}
              </ButtonBase>
            )}
          </Stack>
        </Grid>
      )}

      {canViewDashboard && (userRole !== 'cashier' || canAccessPos) && (
        <Grid item xs={12}>
          <ButtonBase
            onClick={() => navigateWithParams('/reports', reportsQueryParams)}
            sx={{ width: '100%', textAlign: 'inherit', borderRadius: 2 }}
          >
            {paymentSplitLoading ? (
              <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                <LoadingState
                  title={t('dashboard_loading_payment_split_title', 'Loading payment split')}
                  helperText={t('dashboard_loading_payment_split_helper', 'Getting payment method totals for this period.')}
                />
              </Paper>
            ) : paymentSplitFailed ? (
              <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                <ErrorState
                  title={t('dashboard_payment_split_error_title', 'Payment split is unavailable')}
                  helperText={t('dashboard_payment_split_error_helper', 'Could not load payment method breakdown. Please retry.')}
                  actionLabel={t('retry', 'Retry')}
                  onAction={() => setPaymentSplitRefreshNonce((prev) => prev + 1)}
                />
              </Paper>
            ) : paymentSplitSeries.length === 0 ? (
              <Paper sx={{ p: 2, width: '100%', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
                <EmptyState
                  title={t('dashboard_payment_split_empty_title', 'No payment split data')}
                  helperText={t('dashboard_payment_split_empty_helper', 'Payment method totals will appear once payments are posted.')}
                />
              </Paper>
            ) : (
              <MiniBarChart
                title={
                  userRole === 'admin'
                    ? t('dashboard_branch_comparison', 'Branch comparison')
                    : userRole === 'supervisor'
                      ? t('dashboard_approval_queue', 'Approval queue')
                      : t('dashboard_pos_shortcuts', 'POS shortcuts')
                }
                data={(paymentSplitSeries || []).map((entry) => ({
                  label: toTitle(entry.method || t('unknown', 'Unknown')),
                  value: Number(entry.amount || 0),
                  color: 'info.main',
                }))}
              />
            )}
          </ButtonBase>
        </Grid>
      )}


      {canViewBranchComparison && userRole === 'admin' && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                <Typography variant="h6">{t('dashboard_admin_branch_analytics', 'Admin branch analytics')}</Typography>
                <TextField
                  select
                  size="small"
                  label={t('branches', 'Branches')}
                  value={selectedBranchId}
                  onChange={(event) => setSelectedBranchId(event.target.value)}
                  sx={{ minWidth: 220, marginInlineStart: { md: 'auto' } }}
                >
                  <MenuItem value={ALL_BRANCHES_VALUE}>{t('dashboard_all_branches', 'All branches')}</MenuItem>
                  {branches.map((branch) => (
                    <MenuItem key={branch.id} value={branch.id}>{branch.name} ({branch.id})</MenuItem>
                  ))}
                </TextField>
              </Stack>

              {adminBranchLoading ? (
                <LoadingState
                  title={t('dashboard_loading_branch_analytics_title', 'Loading branch analytics')}
                  helperText={t('dashboard_loading_branch_analytics_helper', 'Fetching branch sales, margin, and stockout risk signals.')}
                />
              ) : adminBranchRows.length === 0 ? (
                <EmptyState
                  title={t('dashboard_branch_analytics_empty_title', 'No branch analytics data')}
                  helperText={t('dashboard_branch_analytics_empty_helper', 'Try another period or branch selection to view branch metrics.')}
                />
              ) : (
                <>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <MiniHorizontalChart
                        title={t('dashboard_branch_sales_ranking', 'Branch sales ranking')}
                        data={adminBranchRanking}
                        valueFormatter={formatCurrency}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <MiniHorizontalChart
                        title={t('dashboard_branch_margin_comparison', 'Branch margin comparison')}
                        data={adminBranchMargin}
                        valueFormatter={(value) => `${formatNumber(value)}%`}
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <MiniHorizontalChart
                        title={t('dashboard_branch_stockout_risk_counts', 'Branch stockout-risk counts')}
                        data={adminBranchStockout}
                        valueFormatter={formatNumber}
                      />
                    </Grid>
                  </Grid>

                  <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
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
                              {t('branches', 'Branches')}
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
                              {t('dashboard_branch_sales', 'Sales')}
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
                              {t('dashboard_margin', 'Margin %')}
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
                              {t('dashboard_stockout_risk', 'Stockout risk')}
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
                  {t('dashboard_branch_analytics_partial', 'Some branch metrics could not be loaded fully. Data may be partial.')}
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      )}

      {(canViewDashboard || canViewAging) && (
      <Grid item xs={12}>
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: DASHBOARD_PANEL_MIN_HEIGHT }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">
              {userRole === 'admin'
                ? t('dashboard_aging_reports', 'Aging reports')
                : userRole === 'supervisor'
                  ? t('dashboard_shift_exceptions', 'Shift exceptions')
                  : t('dashboard_today_transactions', 'Today\'s transactions')}
            </Typography>
            <Button
              size="small"
              onClick={() => navigateWithParams('/audit-logs', { start_date: activeRange.date_from, end_date: activeRange.date_to })}
            >
              {t('view_all', 'View all')}
            </Button>
          </Stack>
          {recentActivityLoading ? (
            <LoadingState
              title={t('dashboard_loading_activity_title', 'Loading activity')}
              helperText={t('dashboard_loading_activity_helper', 'We are bringing the latest transactions for you.')}
            />
          ) : recentActivityFailed ? (
            <ErrorState
              title={t('dashboard_recent_activity_error_title', 'Recent activity is unavailable')}
              helperText={t('dashboard_recent_activity_error_helper', 'Could not load transactions at the moment. Please retry.')}
              actionLabel={t('retry', 'Retry')}
              onAction={() => setRecentActivityRefreshNonce((prev) => prev + 1)}
            />
          ) : recentActivity.length === 0 ? (
            <EmptyState
              title={t('dashboard_recent_activity_empty_title', 'No transactions yet')}
              helperText={t('dashboard_recent_activity_empty_helper', 'New transactions will appear here as soon as they happen.')}
            />
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
                  <Typography variant="body2" color="text.secondary">{formatDateTime(item.timestamp)}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Paper>
      </Grid>
      )}
    </Grid>
  );
}
