import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import FormHelperText from '@mui/material/FormHelperText';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { PageHeader, PageShell, SectionPanel } from '../components/PageLayout';
import { formatCurrency, formatDate, formatNumber } from '../utils/formatters';
import { normalizeCollectionResponse } from '../utils/api';

const TableCard = ({ title, columns, rows }) => (
  <SectionPanel title={title} contentSx={{ p: (theme) => theme.customSpacing?.panelPaddingDense || 2, '&:last-child': { pb: (theme) => theme.customSpacing?.panelPaddingDense || 2 } }}>
    <Table>
      <TableHead>
        <TableRow>
          {columns.map((c) => <TableCell key={c.key}>{c.label}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, idx) => (
          <TableRow key={`${title}-${idx}`}>
            {columns.map((c) => <TableCell key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key]}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </SectionPanel>
);

const parseReportsFiltersFromQuery = (params, fallbackTimezone) => ({
  branch_id: params.get('branch_id') || '',
  date_from: params.get('date_from') || '',
  date_to: params.get('date_to') || '',
  timezone: params.get('timezone') || fallbackTimezone,
});

export default function Reports() {
  const { t } = useTranslation();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [searchParams, setSearchParams] = useSearchParams();
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState(() => parseReportsFiltersFromQuery(searchParams, timezone));
  const [appliedFilters, setAppliedFilters] = useState(() => parseReportsFiltersFromQuery(searchParams, timezone));
  const [dailySales, setDailySales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [paymentSplit, setPaymentSplit] = useState([]);
  const [arReport, setArReport] = useState([]);
  const [grossMargin, setGrossMargin] = useState({ revenue: 0, cogs: 0, gross_margin: 0, margin_pct: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateValidationError, setDateValidationError] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(appliedFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }, [appliedFilters]);

  const validateDateRangeFilters = (nextFilters) => {
    const hasFrom = Boolean(nextFilters.date_from);
    const hasTo = Boolean(nextFilters.date_to);

    if (hasFrom !== hasTo) {
      return 'reports_date_range_requires_both';
    }

    return '';
  };

  const withQuery = (path, extraParams) => {
    const params = new URLSearchParams(queryParams);
    if (extraParams) {
      Object.entries(extraParams).forEach(([key, value]) => {
        params.set(key, value);
      });
    }
    const serialized = params.toString();
    return serialized ? `${path}?${serialized}` : path;
  };

  const loadReports = async () => {
    setIsLoading(true);
    try {
      const [branchesRes, dailySalesRes, topProductsRes, topCustomersRes, paymentSplitRes, grossMarginRes, arReportRes] = await Promise.allSettled([
        axios.get('/api/v1/branches/'),
        axios.get(withQuery('/api/v1/reports/daily-sales/')),
        axios.get(withQuery('/api/v1/reports/top-products/')),
        axios.get(withQuery('/api/v1/reports/top-customers/')),
        axios.get(withQuery('/api/v1/reports/payment-method-split/')),
        axios.get(withQuery('/api/v1/reports/gross-margin/')),
        axios.get(withQuery('/api/v1/reports/accounts-receivable/')),
      ]);

      const failedRequests = [branchesRes, dailySalesRes, topProductsRes, topCustomersRes, paymentSplitRes, grossMarginRes, arReportRes]
        .filter((response) => response.status === 'rejected');

      setBranches(branchesRes.status === 'fulfilled' ? normalizeCollectionResponse(branchesRes.value.data) : []);
      setDailySales(dailySalesRes.status === 'fulfilled' ? normalizeCollectionResponse(dailySalesRes.value.data) : []);
      setTopProducts(topProductsRes.status === 'fulfilled' ? normalizeCollectionResponse(topProductsRes.value.data) : []);
      setTopCustomers(topCustomersRes.status === 'fulfilled' ? normalizeCollectionResponse(topCustomersRes.value.data) : []);
      setPaymentSplit(paymentSplitRes.status === 'fulfilled' ? normalizeCollectionResponse(paymentSplitRes.value.data) : []);
      setGrossMargin(grossMarginRes.status === 'fulfilled' ? grossMarginRes.value.data || {} : { revenue: 0, cogs: 0, gross_margin: 0, margin_pct: 0 });
      setArReport(arReportRes.status === 'fulfilled' ? normalizeCollectionResponse(arReportRes.value.data) : []);

      if (failedRequests.length > 0) {
        setError('reports_partial_load_error');
      } else {
        setError('');
      }
    } catch {
      setError('reports_load_error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [queryParams]);

  useEffect(() => {
    const incomingFilters = parseReportsFiltersFromQuery(searchParams, timezone);
    const hasChanges = Object.keys(incomingFilters).some((key) => incomingFilters[key] !== filters[key]);
    if (hasChanges) {
      setFilters(incomingFilters);
      setAppliedFilters(incomingFilters);
      setDateValidationError(validateDateRangeFilters(incomingFilters));
    }
  }, [filters, searchParams, timezone]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
    });

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams);
    }
  }, [appliedFilters, searchParams, setSearchParams]);

  const applyFilters = () => {
    const validationError = validateDateRangeFilters(filters);
    setDateValidationError(validationError);

    if (validationError) {
      return;
    }

    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    const resetFilters = { branch_id: '', date_from: '', date_to: '', timezone };
    setDateValidationError('');
    setFilters(resetFilters);
    setAppliedFilters(resetFilters);
  };

  const exportCsv = (endpoint) => {
    const url = withQuery(`/api/v1/reports/${endpoint}/`, { format: 'csv' });
    window.open(url, '_blank');
  };

  return (
    <PageShell>
      <PageHeader
        title={t('reports')}
        subtitle={t('reports_page_subtitle')}
      />

      {error && (
        <ErrorState
          icon={InsightsOutlinedIcon}
          title={t('reports_error_title')}
          helperText={t(error)}
          actionLabel={t('reports_retry')}
          onAction={loadReports}
        />
      )}
      {isLoading && <LoadingState icon={InsightsOutlinedIcon} title={t('reports_loading_title')} helperText={t('reports_loading_helper')} />}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <SectionPanel title={t('reports_filters_title')} subtitle={t('reports_filters_subtitle')}>
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
              <TextField
                select
                label={t('branch')}
                value={filters.branch_id}
                onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">{t('all')}</MenuItem>
                {branches.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </TextField>
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    type="date"
                    label={t('from')}
                    InputLabelProps={{ shrink: true }}
                    value={filters.date_from}
                    error={Boolean(dateValidationError)}
                    onChange={(e) => {
                      setFilters((f) => ({ ...f, date_from: e.target.value }));
                      setDateValidationError('');
                    }}
                  />
                  <TextField
                    type="date"
                    label={t('to')}
                    InputLabelProps={{ shrink: true }}
                    value={filters.date_to}
                    error={Boolean(dateValidationError)}
                    onChange={(e) => {
                      setFilters((f) => ({ ...f, date_to: e.target.value }));
                      setDateValidationError('');
                    }}
                  />
                </Stack>
                {dateValidationError && <FormHelperText error>{t(dateValidationError)}</FormHelperText>}
              </Stack>
              <TextField label={t('timezone')} value={filters.timezone} onChange={(e) => setFilters((f) => ({ ...f, timezone: e.target.value }))} sx={{ minWidth: 200 }} />
              <Button variant="contained" onClick={applyFilters}>{t('refresh')}</Button>
              <Button variant="text" onClick={clearFilters}>{t('clear_filters')}</Button>
            </Stack>
          </SectionPanel>
        </Grid>

        {[
          [t('reports_metric_revenue'), formatCurrency(grossMargin.revenue)],
          [t('reports_metric_cogs'), formatCurrency(grossMargin.cogs)],
          [t('reports_metric_gross_margin'), formatCurrency(grossMargin.gross_margin)],
          [t('reports_metric_margin_pct'), `${formatNumber(Number(grossMargin.margin_pct || 0).toFixed(2))}%`],
        ].map(([label, value]) => (
          <Grid item xs={12} md={3} key={label}>
            <Card variant="panel">
              <CardContent sx={{ p: (theme) => theme.customSpacing?.panelPadding || 2.5 }}>
                <Typography variant="overline">{label}</Typography>
                <Typography variant="h5">{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}

        <Grid item xs={12} md={6}>
          <SectionPanel title={t('reports_payment_method_split_title')}>
            <Stack spacing={1.5}>
              {paymentSplit.map((p) => (
                <Box key={p.method}>
                  <Typography variant="body2" sx={{ color: 'text.primary' }}>
                    {p.method.toUpperCase()} - {formatCurrency(p.amount)} ({formatNumber(p.percentage)}%)
                  </Typography>
                  <LinearProgress variant="determinate" value={Number(p.percentage || 0)} />
                </Box>
              ))}
            </Stack>
            {!paymentSplit.length && <EmptyState icon={InsightsOutlinedIcon} title={t('reports_payment_empty_title')} helperText={t('reports_payment_empty_helper')} />}
            <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('payment-method-split')}>{t('reports_export_csv')}</Button>
          </SectionPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <TableCard
            title={t('reports_daily_sales_title')}
            columns={[
              { key: 'day', label: t('reports_column_day'), render: (v) => formatDate(v) },
              { key: 'invoice_count', label: t('reports_column_invoices'), render: (v) => formatNumber(v) },
              { key: 'gross_sales', label: t('reports_column_gross_sales'), render: (v) => formatCurrency(v) },
            ]}
            rows={dailySales}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('daily-sales')}>{t('reports_export_csv')}</Button>
        </Grid>

        <Grid item xs={12} md={6}>
          <TableCard
            title={t('reports_top_products_title')}
            columns={[
              { key: 'product__name', label: t('product') },
              { key: 'quantity', label: t('reports_column_qty'), render: (v) => formatNumber(v) },
              { key: 'revenue', label: t('reports_metric_revenue'), render: (v) => formatCurrency(v) },
              { key: 'gross_margin', label: t('reports_column_margin'), render: (v) => formatCurrency(v) },
            ]}
            rows={topProducts}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('top-products')}>{t('reports_export_csv')}</Button>
        </Grid>

        <Grid item xs={12} md={6}>
          <TableCard
            title={t('reports_top_customers_title')}
            columns={[
              { key: 'customer__name', label: t('customer') },
              { key: 'invoice_count', label: t('reports_column_invoices'), render: (v) => formatNumber(v) },
              { key: 'gross_sales', label: t('reports_column_sales'), render: (v) => formatCurrency(v) },
              { key: 'balance_due', label: t('reports_column_outstanding'), render: (v) => formatCurrency(v) },
            ]}
            rows={topCustomers}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('top-customers')}>{t('reports_export_csv')}</Button>
        </Grid>

        <Grid item xs={12}>
          <TableCard
            title={t('reports_accounts_receivable_title')}
            columns={[
              { key: 'invoice_number', label: t('invoice') },
              { key: 'customer', label: t('customer') },
              { key: 'status', label: t('status') },
              { key: 'amount_paid', label: t('paid'), render: (v) => formatCurrency(v) },
              { key: 'balance_due', label: t('balance'), render: (v) => formatCurrency(v) },
              { key: 'age_days', label: t('reports_column_age_days'), render: (v) => formatNumber(v) },
            ]}
            rows={arReport}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('accounts-receivable')}>{t('reports_export_csv')}</Button>
        </Grid>
      </Grid>
    </PageShell>
  );
}
