import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
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
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [searchParams, setSearchParams] = useSearchParams();
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState(() => parseReportsFiltersFromQuery(searchParams, timezone));
  const [dailySales, setDailySales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [paymentSplit, setPaymentSplit] = useState([]);
  const [arReport, setArReport] = useState([]);
  const [grossMargin, setGrossMargin] = useState({ revenue: 0, cogs: 0, gross_margin: 0, margin_pct: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }, [filters]);

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
        setError('في بيانات من التقارير ما اتحمّلتش. جرّب تعمل تحديث.');
      } else {
        setError('');
      }
    } catch {
      setError('في مشكلة في تحميل التقارير. جرّب تعمل تحديث.');
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
    }
  }, [filters, searchParams, timezone]);

  useEffect(() => {
    const nextParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) nextParams.set(key, value);
    });

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams);
    }
  }, [filters, searchParams, setSearchParams]);

  const clearFilters = () => {
    setFilters({ branch_id: '', date_from: '', date_to: '', timezone });
  };

  const exportCsv = (endpoint) => {
    const url = withQuery(`/api/v1/reports/${endpoint}/`, { format: 'csv' });
    window.open(url, '_blank');
  };

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        subtitle="Standardized cards, spacing, and table density across analytics views."
      />

      {error && (
        <ErrorState
          icon={InsightsOutlinedIcon}
          title="التقارير مش راضية تتحمّل"
          helperText={error}
          actionLabel="جرّب تاني"
          onAction={loadReports}
        />
      )}
      {isLoading && <LoadingState icon={InsightsOutlinedIcon} title="بنجهّز التقارير" helperText="استنّى شوية وهتظهر البيانات." />}

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <SectionPanel title="Filters" subtitle="Use a consistent filter rhythm and button hierarchy.">
            <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
              <TextField
                select
                label="Branch"
                value={filters.branch_id}
                onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value }))}
                sx={{ minWidth: 180 }}
              >
                <MenuItem value="">All</MenuItem>
                {branches.map((b) => <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>)}
              </TextField>
              <TextField type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} />
              <TextField type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} />
              <TextField label="Timezone" value={filters.timezone} onChange={(e) => setFilters((f) => ({ ...f, timezone: e.target.value }))} sx={{ minWidth: 200 }} />
              <Button variant="contained" onClick={loadReports}>Refresh</Button>
              <Button variant="text" onClick={clearFilters}>Clear filters</Button>
            </Stack>
          </SectionPanel>
        </Grid>

        {[
          ['Revenue', formatCurrency(grossMargin.revenue)],
          ['COGS', formatCurrency(grossMargin.cogs)],
          ['Gross Margin', formatCurrency(grossMargin.gross_margin)],
          ['Margin %', `${formatNumber(Number(grossMargin.margin_pct || 0).toFixed(2))}%`],
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
          <SectionPanel title="Payment Method Split">
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
            {!paymentSplit.length && <EmptyState icon={InsightsOutlinedIcon} title="مفيش بيانات دفع" helperText="اختار فترة زمنية أو فرع مختلف." />}
            <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('payment-method-split')}>Export CSV</Button>
          </SectionPanel>
        </Grid>

        <Grid item xs={12} md={6}>
          <TableCard
            title="Daily Sales"
            columns={[{ key: 'day', label: 'Day', render: (v) => formatDate(v) }, { key: 'invoice_count', label: 'Invoices', render: (v) => formatNumber(v) }, { key: 'gross_sales', label: 'Gross Sales', render: (v) => formatCurrency(v) }]}
            rows={dailySales}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('daily-sales')}>Export CSV</Button>
        </Grid>

        <Grid item xs={12} md={6}>
          <TableCard
            title="Top Products (drill-down)"
            columns={[
              { key: 'product__name', label: 'Product' },
              { key: 'quantity', label: 'Qty', render: (v) => formatNumber(v) },
              { key: 'revenue', label: 'Revenue', render: (v) => formatCurrency(v) },
              { key: 'gross_margin', label: 'Margin', render: (v) => formatCurrency(v) },
            ]}
            rows={topProducts}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('top-products')}>Export CSV</Button>
        </Grid>

        <Grid item xs={12} md={6}>
          <TableCard
            title="Top Customers (drill-down)"
            columns={[
              { key: 'customer__name', label: 'Customer' },
              { key: 'invoice_count', label: 'Invoices', render: (v) => formatNumber(v) },
              { key: 'gross_sales', label: 'Sales', render: (v) => formatCurrency(v) },
              { key: 'balance_due', label: 'Outstanding', render: (v) => formatCurrency(v) },
            ]}
            rows={topCustomers}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('top-customers')}>Export CSV</Button>
        </Grid>

        <Grid item xs={12}>
          <TableCard
            title="Accounts Receivable / Partial Payments"
            columns={[
              { key: 'invoice_number', label: 'Invoice' },
              { key: 'customer', label: 'Customer' },
              { key: 'status', label: 'Status' },
              { key: 'amount_paid', label: 'Paid', render: (v) => formatCurrency(v) },
              { key: 'balance_due', label: 'Balance', render: (v) => formatCurrency(v) },
              { key: 'age_days', label: 'Age (days)', render: (v) => formatNumber(v) },
            ]}
            rows={arReport}
          />
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('accounts-receivable')}>Export CSV</Button>
        </Grid>
      </Grid>
    </PageShell>
  );
}
