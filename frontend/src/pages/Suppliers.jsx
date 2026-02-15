import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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

const toRows = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const formatMoney = (value) => Number(value || 0).toFixed(2);

export default function Suppliers() {
  const { t } = useTranslation();
  const { can } = useAuth();

  const [suppliers, setSuppliers] = useState([]);
  const [agingRows, setAgingRows] = useState([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentDrafts, setPaymentDrafts] = useState({});
  const [submittingSupplierId, setSubmittingSupplierId] = useState(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');

      try {
        const suppliersResponse = await axios.get('/api/v1/suppliers/');
        setSuppliers(toRows(suppliersResponse.data));

        try {
          const agingResponse = await axios.get('/api/v1/reports/supplier-aging/');
          setAgingRows(toRows(agingResponse.data));
        } catch (agingError) {
          const balancesResponse = await axios.get('/api/v1/reports/supplier-balances/');
          setAgingRows(toRows(balancesResponse.data));
          console.warn('supplier-aging endpoint unavailable, used supplier-balances instead', agingError);
        }
      } catch (err) {
        console.error('Failed to load supplier window data', err);
        setError(t('suppliers_load_error'));
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [t]);

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

  const handlePaymentDraftChange = (supplierId, amount) => {
    setPaymentDrafts((prev) => ({ ...prev, [supplierId]: amount }));
  };

  const submitQuickPayment = async (supplierId) => {
    const amount = paymentDrafts[supplierId];
    if (!amount || Number(amount) <= 0) return;

    setSubmittingSupplierId(supplierId);
    setError('');
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
      setError(t('suppliers_payment_error'));
    } finally {
      setSubmittingSupplierId(null);
    }
  };

  return (
    <Box>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4">{t('suppliers')}</Typography>
          <Typography color="text.secondary">{t('suppliers_subtitle')}</Typography>
        </Box>

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
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight={600}>{supplier.name}</Typography>
                          {supplier.is_active === false && <Chip size="small" label={t('inactive')} />}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{primaryContact?.name || '-'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {primaryContact?.phone || primaryContact?.email || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatMoney(summary?.balance_due)}</TableCell>
                      <TableCell>{formatMoney(summary?.aging?.current)}</TableCell>
                      <TableCell>{formatMoney(summary?.aging?.['30'])}</TableCell>
                      <TableCell>{formatMoney(summary?.aging?.['60'])}</TableCell>
                      <TableCell>{formatMoney(summary?.aging?.['90_plus'])}</TableCell>
                      {can('supplier.payment.create') && (
                        <TableCell>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                            <TextField
                              size="small"
                              type="number"
                              value={paymentDrafts[supplier.id] || ''}
                              onChange={(event) => handlePaymentDraftChange(supplier.id, event.target.value)}
                              placeholder={t('payment_amount')}
                              inputProps={{ min: '0', step: '0.01' }}
                            />
                            <Button
                              size="small"
                              variant="contained"
                              disabled={submittingSupplierId === supplier.id || !paymentDrafts[supplier.id]}
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
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="body2">{t('suppliers_empty_state')}</Typography>
                        </CardContent>
                      </Card>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Box>
  );
}
