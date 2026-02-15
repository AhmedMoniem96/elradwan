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
import { PageShell, SectionPanel } from '../components/PageLayout';

const money = (v) => `$${Number(v || 0).toFixed(2)}`;

const TableCard = ({ title, columns, rows }) => (
  <SectionPanel title={title} contentSx={{ p: 2, '&:last-child': { pb: 2 } }}>
    <Table size="small">
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

export default function Reports() {
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState({ branch_id: '', date_from: '', date_to: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const [dailySales, setDailySales] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [paymentSplit, setPaymentSplit] = useState([]);
  const [arReport, setArReport] = useState([]);
  const [grossMargin, setGrossMargin] = useState({ revenue: 0, cogs: 0, gross_margin: 0, margin_pct: 0 });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }, [filters]);

  const loadReports = () => {
    axios.get('/api/v1/branches/').then((res) => setBranches(res.data || [])).catch(() => {});
    axios.get(`/api/v1/reports/daily-sales/?${queryParams}`).then((res) => setDailySales(res.data.results || [])).catch(() => {});
    axios.get(`/api/v1/reports/top-products/?${queryParams}`).then((res) => setTopProducts(res.data.results || [])).catch(() => {});
    axios.get(`/api/v1/reports/top-customers/?${queryParams}`).then((res) => setTopCustomers(res.data.results || [])).catch(() => {});
    axios.get(`/api/v1/reports/payment-method-split/?${queryParams}`).then((res) => setPaymentSplit(res.data.results || [])).catch(() => {});
    axios.get(`/api/v1/reports/gross-margin/?${queryParams}`).then((res) => setGrossMargin(res.data || {})).catch(() => {});
    axios.get(`/api/v1/reports/accounts-receivable/?${queryParams}`).then((res) => setArReport(res.data.results || [])).catch(() => {});
  };

  useEffect(() => {
    loadReports();
  }, [queryParams]);

  const exportCsv = (endpoint) => {
    const url = `/api/v1/reports/${endpoint}/?${queryParams}&format=csv`;
    window.open(url, '_blank');
  };

  return (
    <PageShell>
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <SectionPanel contentSx={{ p: 2 }}>
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
          <Button variant="outlined" onClick={loadReports}>Refresh</Button>
          </Stack>
        </SectionPanel>
      </Grid>

      {[
        ['Revenue', money(grossMargin.revenue)],
        ['COGS', money(grossMargin.cogs)],
        ['Gross Margin', money(grossMargin.gross_margin)],
        ['Margin %', `${Number(grossMargin.margin_pct || 0).toFixed(2)}%`],
      ].map(([label, value]) => (
        <Grid item xs={12} md={3} key={label}>
          <Card variant="panel"><CardContent><Typography variant="overline">{label}</Typography><Typography variant="h5">{value}</Typography></CardContent></Card>
        </Grid>
      ))}

      <Grid item xs={12} md={6}>
        <SectionPanel title="Payment Method Split" contentSx={{ p: 2 }}>
          <Typography variant="h6">Payment Method Split</Typography>
          {paymentSplit.map((p) => (
            <div key={p.method} style={{ marginTop: 10 }}>
              <Typography variant="body2">{p.method.toUpperCase()} - {money(p.amount)} ({p.percentage}%)</Typography>
              <LinearProgress variant="determinate" value={Number(p.percentage || 0)} />
            </div>
          ))}
          <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('payment-method-split')}>Export CSV</Button>
        </SectionPanel>
      </Grid>
      <Grid item xs={12} md={6}>
        <TableCard
          title="Daily Sales"
          columns={[{ key: 'day', label: 'Day' }, { key: 'invoice_count', label: 'Invoices' }, { key: 'gross_sales', label: 'Gross Sales', render: (v) => money(v) }]}
          rows={dailySales}
        />
        <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('daily-sales')}>Export CSV</Button>
      </Grid>

      <Grid item xs={12} md={6}>
        <TableCard
          title="Top Products (drill-down)"
          columns={[
            { key: 'product__name', label: 'Product' },
            { key: 'quantity', label: 'Qty' },
            { key: 'revenue', label: 'Revenue', render: (v) => money(v) },
            { key: 'gross_margin', label: 'Margin', render: (v) => money(v) },
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
            { key: 'invoice_count', label: 'Invoices' },
            { key: 'gross_sales', label: 'Sales', render: (v) => money(v) },
            { key: 'balance_due', label: 'Outstanding', render: (v) => money(v) },
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
            { key: 'amount_paid', label: 'Paid', render: (v) => money(v) },
            { key: 'balance_due', label: 'Balance', render: (v) => money(v) },
            { key: 'age_days', label: 'Age (days)' },
          ]}
          rows={arReport}
        />
        <Button sx={{ mt: 1 }} size="small" onClick={() => exportCsv('accounts-receivable')}>Export CSV</Button>
      </Grid>
    </Grid>
    </PageShell>
  );
}
