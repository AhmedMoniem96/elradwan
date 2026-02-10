import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const PERCENTAGE_PRESETS = [25, 50, 75, 100];

export default function POS() {
  const { t } = useTranslation();
  const [invoiceTotal, setInvoiceTotal] = useState('0');
  const [paymentInputMode, setPaymentInputMode] = useState('amount');
  const [paymentValue, setPaymentValue] = useState('0');
  const [payments, setPayments] = useState([]);

  const parsedTotal = Number(invoiceTotal) || 0;
  const paidSoFar = useMemo(
    () => payments.reduce((acc, p) => acc + p.amount, 0),
    [payments],
  );
  const remaining = Math.max(parsedTotal - paidSoFar, 0);

  const computedPaymentAmount = useMemo(() => {
    const value = Number(paymentValue) || 0;
    if (paymentInputMode === 'percentage') {
      return Math.min((parsedTotal * value) / 100, remaining);
    }
    return Math.min(value, remaining);
  }, [paymentValue, paymentInputMode, parsedTotal, remaining]);

  const handleAddPayment = () => {
    if (computedPaymentAmount <= 0) {
      return;
    }

    setPayments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        amount: Number(computedPaymentAmount.toFixed(2)),
        label:
          paymentInputMode === 'percentage'
            ? `${paymentValue}%`
            : `$${Number(paymentValue || 0).toFixed(2)}`,
      },
    ]);
    setPaymentValue('0');
    setPaymentInputMode('amount');
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('pos')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Accept full, half, or any percentage now and collect the balance later.
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <TextField
          label={t('invoice_total')}
          type="number"
          value={invoiceTotal}
          inputProps={{ min: 0, step: '0.01' }}
          onChange={(e) => {
            setInvoiceTotal(e.target.value);
            setPayments([]);
          }}
        />

        <TextField
          label={paymentInputMode === 'percentage' ? t('payment_percentage') : t('payment_amount')}
          type="number"
          value={paymentValue}
          inputProps={{ min: 0, step: '0.01' }}
          onChange={(e) => setPaymentValue(e.target.value)}
        />
      </Box>

      <Box sx={{ my: 2 }}>
        <ButtonGroup variant="outlined" sx={{ mb: 1 }}>
          <Button onClick={() => setPaymentInputMode('amount')}>{t('payment_amount')}</Button>
          <Button onClick={() => setPaymentInputMode('percentage')}>{t('payment_percentage')}</Button>
        </ButtonGroup>

        <Box>
          {PERCENTAGE_PRESETS.map((preset) => (
            <Button
              key={preset}
              sx={{ mr: 1, mb: 1 }}
              size="small"
              variant="contained"
              onClick={() => {
                setPaymentInputMode('percentage');
                setPaymentValue(String(preset));
              }}
            >
              {preset}%
            </Button>
          ))}
        </Box>
      </Box>

      <Button variant="contained" onClick={handleAddPayment}>
        {t('record_payment')}
      </Button>

      <Divider sx={{ my: 3 }} />

      <Typography>{t('amount_paid')}: ${paidSoFar.toFixed(2)}</Typography>
      <Typography>{t('remaining_balance')}: ${remaining.toFixed(2)}</Typography>

      <List>
        {payments.map((payment, index) => (
          <ListItem key={payment.id} divider>
            <ListItemText
              primary={`${t('payment')} #${index + 1}`}
              secondary={`${payment.label} → $${payment.amount.toFixed(2)}`}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
