import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../AuthContext';
import { PageHeader, PageShell, SectionPanel } from '../components/PageLayout';
import { formatFieldErrors, parseApiError } from '../utils/api';

const toRows = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const formatMoney = (value) => Number(value || 0).toFixed(2);

const getAgingValue = (summary, key) => {
  if (!summary) return 0;
  if (summary.aging && summary.aging[key] != null) return Number(summary.aging[key]);
  return Number(summary[key] || 0);
};

function AgingWidget({ label, value }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" fontWeight={700}>{formatMoney(value)}</Typography>
      </CardContent>
    </Card>
  );
}

export default function Suppliers() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [suppliers, setSuppliers] = useState([]);
  const [agingRows, setAgingRows] = useState([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [paymentErrors, setPaymentErrors] = useState({});
  const [submittingSupplierId, setSubmittingSupplierId] = useState(null);

  const loadSupplierData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [suppliersResponse, agingResponse] = await Promise.all([
        axios.get('/api/v1/suppliers/'),
        axios.get('/api/v1/reports/supplier-aging/'),
      ]);

      setSuppliers(toRows(suppliersResponse.data));
      setAgingRows(toRows(agingResponse.data));
    } catch (err) {
      console.error('Failed to load supplier window data', err);
      const parsedError = parseApiError(err);
      const parsedMessage = formatFieldErrors(parsedError.fieldErrors) || parsedError.message;
      setError(parsedMessage || t('suppliers_load_error'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSupplierData();
  }, []);

  const agingBySupplierId = useMemo(
    () => new Map(agingRows.map((row) => [String(row.supplier_id), row])),
    [agingRows],
  );

  const filteredSuppliers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return suppliers;

    return suppliers.filter((supplier) => {
      const name = String(supplier.name || '').toLowerCase();
      const contactText = (supplier.contacts || [])
        .map((contact) => `${contact.name || ''} ${contact.phone || ''} ${contact.email || ''}`.toLowerCase())
        .join(' ');

      return name.includes(normalized) || contactText.includes(normalized);
    });
  }, [query, suppliers]);

  const totals = useMemo(() => {
    return filteredSuppliers.reduce((acc, supplier) => {
      const summary = agingBySupplierId.get(String(supplier.id));
      acc.balance += Number(summary?.balance_due || 0);
      acc.current += getAgingValue(summary, 'current');
      acc.d30 += getAgingValue(summary, '30');
      acc.d60 += getAgingValue(summary, '60');
      acc.d90 += getAgingValue(summary, '90_plus');
      return acc;
    }, {
      balance: 0,
      current: 0,
      d30: 0,
      d60: 0,
      d90: 0,
    });
  }, [agingBySupplierId, filteredSuppliers]);

  const handlePaymentDraftChange = (supplierId, amount) => {
    setPaymentDrafts((prev) => ({ ...prev, [supplierId]: amount }));
    setPaymentErrors((prev) => ({ ...prev, [supplierId]: '' }));
  };

  const submitQuickPayment = async (supplierId) => {
    const rawAmount = paymentDrafts[supplierId];
    const amount = Number(rawAmount);

    if (!rawAmount || Number.isNaN(amount) || amount <= 0) {
      setPaymentErrors((prev) => ({ ...prev, [supplierId]: t('suppliers_payment_amount_required') }));
      return;
    }

    setSubmittingSupplierId(supplierId);
    setError('');
    setPaymentErrors((prev) => ({ ...prev, [supplierId]: '' }));

    try {
      await axios.post(`/api/v1/suppliers/${supplierId}/payments/`, {
        amount,
        method: 'bank_transfer',
      });

      setPaymentDrafts((prev) => ({ ...prev, [supplierId]: '' }));
      const agingResponse = await axios.get('/api/v1/reports/supplier-aging/');
      setAgingRows(toRows(agingResponse.data));
    } catch (err) {
      console.error('Failed to register supplier payment', err);
      const parsedError = parseApiError(err);
      const fieldMessage = formatFieldErrors(parsedError.fieldErrors);
      setPaymentErrors((prev) => ({ ...prev, [supplierId]: fieldMessage || '' }));
      setError(parsedError.message || (!fieldMessage ? t('suppliers_payment_error') : ''));
    } finally {
      setSubmittingSupplierId(null);
    }
  };

  return (
    <PageShell>
      <PageHeader title={t('suppliers')} subtitle={t('suppliers_subtitle')} />

      <SectionPanel
        title={t('suppliers_balances_overview')}
        subtitle={t('suppliers_balances_overview_subtitle')}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <AgingWidget label={t('suppliers_balance')} value={totals.balance} />
          <AgingWidget label={t('suppliers_aging_current')} value={totals.current} />
          <AgingWidget label={t('suppliers_aging_30')} value={totals.d30} />
          <AgingWidget label={t('suppliers_aging_60')} value={totals.d60} />
          <AgingWidget label={t('suppliers_aging_90_plus')} value={totals.d90} />
        </Stack>
      </SectionPanel>

      <SectionPanel>
        <Stack spacing={2}>
          <TextField
            label={t('suppliers_search_label')}
            placeholder={t('suppliers_search_placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            fullWidth
          />

          {error && <Alert severity="error">{error}</Alert>}

          {isLoading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2">{t('suppliers_loading')}</Typography>
            </Stack>
          ) : (
            <TableContainer component={Card} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('name')}</TableCell>
                    <TableCell>{t('suppliers_primary_contact')}</TableCell>
                    <TableCell>{t('suppliers_balance')}</TableCell>
                    <TableCell>{t('suppliers_aging_current')}</TableCell>
                    <TableCell>{t('suppliers_aging_30')}</TableCell>
                    <TableCell>{t('suppliers_aging_60')}</TableCell>
                    <TableCell>{t('suppliers_aging_90_plus')}</TableCell>
                    {can('supplier.payment.create') && <TableCell>{t('suppliers_quick_payment')}</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSuppliers.map((supplier) => {
                    const primaryContact = (supplier.contacts || []).find((contact) => contact.is_primary)
                      || (supplier.contacts || [])[0];
                    const summary = agingBySupplierId.get(String(supplier.id));

                    return (
                      <TableRow key={supplier.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>{supplier.name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{primaryContact?.name || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {primaryContact?.phone || primaryContact?.email || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>{formatMoney(summary?.balance_due)}</TableCell>
                        <TableCell>{formatMoney(getAgingValue(summary, 'current'))}</TableCell>
                        <TableCell>{formatMoney(getAgingValue(summary, '30'))}</TableCell>
                        <TableCell>{formatMoney(getAgingValue(summary, '60'))}</TableCell>
                        <TableCell>{formatMoney(getAgingValue(summary, '90_plus'))}</TableCell>
                        {can('supplier.payment.create') && (
                          <TableCell>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                              <TextField
                                size="small"
                                type="number"
                                value={paymentDrafts[supplier.id] || ''}
                                onChange={(event) => handlePaymentDraftChange(supplier.id, event.target.value)}
                                placeholder={t('payment_amount')}
                                error={Boolean(paymentErrors[supplier.id])}
                                helperText={paymentErrors[supplier.id] || ''}
                                inputProps={{ min: '0', step: '0.01' }}
                              />
                              <Button
                                size="small"
                                variant="contained"
                                disabled={submittingSupplierId === supplier.id}
                                onClick={() => submitQuickPayment(supplier.id)}
                              >
                                {t('record_payment')}
                              </Button>
                            </Stack>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {filteredSuppliers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={can('supplier.payment.create') ? 8 : 7}>
                        <Box sx={{ py: 2 }}>
                          <Typography variant="body2">{t('suppliers_empty_state')}</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </SectionPanel>
    </PageShell>
  );
}
