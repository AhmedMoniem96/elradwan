import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const PERCENTAGE_PRESETS = [25, 50, 75, 100];
const MAX_SEARCH_RESULTS = 8;

const normalize = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const scoreProductMatch = (product, queryTokens) => {
  if (queryTokens.length === 0) {
    return 0;
  }

  const name = normalize(product.name);
  const sku = normalize(product.sku);
  const barcode = normalize(product.barcode);

  let score = 0;
  let matchedTokens = 0;

  queryTokens.forEach((token) => {
    let tokenScore = 0;

    if (name === token) {
      tokenScore = Math.max(tokenScore, 120);
    }
    if (sku === token || barcode === token) {
      tokenScore = Math.max(tokenScore, 110);
    }
    if (name.startsWith(token)) {
      tokenScore = Math.max(tokenScore, 80);
    }
    if (sku.startsWith(token) || barcode.startsWith(token)) {
      tokenScore = Math.max(tokenScore, 75);
    }
    if (name.includes(token)) {
      tokenScore = Math.max(tokenScore, 60);
    }
    if (sku.includes(token) || barcode.includes(token)) {
      tokenScore = Math.max(tokenScore, 55);
    }

    if (tokenScore > 0) {
      matchedTokens += 1;
      score += tokenScore;
    }
  });

  if (matchedTokens === queryTokens.length) {
    score += 35;
  }

  score -= Math.min(name.length, 40) / 10;

  return score;
};

const scoreCustomerMatch = (customer, query) => {
  const normalizedQuery = normalize(query);
  const normalizedPhoneQuery = normalizePhone(query);
  if (!normalizedQuery && !normalizedPhoneQuery) {
    return 0;
  }

  const customerName = normalize(customer.name);
  const customerPhone = normalizePhone(customer.phone);
  let score = 0;

  if (normalizedPhoneQuery && customerPhone) {
    if (customerPhone === normalizedPhoneQuery) {
      score = Math.max(score, 1200);
    } else if (customerPhone.startsWith(normalizedPhoneQuery)) {
      score = Math.max(score, 900);
    } else if (customerPhone.includes(normalizedPhoneQuery)) {
      score = Math.max(score, 700);
    }
  }

  if (normalizedQuery && customerName.includes(normalizedQuery)) {
    score = Math.max(score, 450);
  }

  score -= Math.min(customerName.length, 40) / 20;
  return score;
};

export default function POS() {
  const { t } = useTranslation();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [error, setError] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState('0');
  const [paymentInputMode, setPaymentInputMode] = useState('amount');
  const [paymentValue, setPaymentValue] = useState('0');
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('/api/v1/products/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setProducts(payload.filter((product) => product.is_active !== false));
        setError('');
      } catch (err) {
        console.error('Failed to load products for POS', err);
        setError('Failed to load products');
      }
    };

    fetchProducts();

    const fetchCustomers = async () => {
      try {
        const response = await axios.get('/api/v1/customers/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setCustomers(payload);
      } catch (err) {
        console.error('Failed to load customers for POS', err);
      }
    };

    fetchCustomers();
  }, []);

  const searchableProducts = useMemo(() => {
    const query = normalize(searchQuery);
    if (!query) {
      return [];
    }

    const queryTokens = query.split(/\s+/).filter(Boolean);

    return products
      .map((product) => ({
        product,
        score: scoreProductMatch(product, queryTokens),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SEARCH_RESULTS)
      .map((item) => item.product);
  }, [products, searchQuery]);

  const cartSubtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0),
    [cart],
  );

  const parsedInvoiceTotal = useMemo(
    () => (Number(invoiceTotal) > 0 ? Number(invoiceTotal) : Number(cartSubtotal.toFixed(2))),
    [invoiceTotal, cartSubtotal],
  );

  useEffect(() => {
    if (!invoiceTotal || Number(invoiceTotal) === 0) {
      setInvoiceTotal(String(Number(cartSubtotal.toFixed(2))));
    }
  }, [cartSubtotal, invoiceTotal]);

  const paidSoFar = useMemo(
    () => payments.reduce((acc, p) => acc + p.amount, 0),
    [payments],
  );
  const remaining = Math.max(parsedInvoiceTotal - paidSoFar, 0);

  const computedPaymentAmount = useMemo(() => {
    const value = Number(paymentValue) || 0;
    if (paymentInputMode === 'percentage') {
      return Math.min((parsedInvoiceTotal * value) / 100, remaining);
    }
    return Math.min(value, remaining);
  }, [paymentValue, paymentInputMode, parsedInvoiceTotal, remaining]);

  const searchableCustomers = useMemo(() => {
    const query = customerQuery.trim();
    if (!query) {
      return [];
    }

    return customers
      .map((customer) => ({
        customer,
        score: scoreCustomerMatch(customer, query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SEARCH_RESULTS)
      .map((item) => item.customer);
  }, [customerQuery, customers]);

  const invoicePayload = useMemo(
    () => ({
      total: Number(parsedInvoiceTotal.toFixed(2)),
      customer_id: selectedCustomer?.id,
      lines: cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        unit_price: Number(item.unitPrice.toFixed(2)),
      })),
      payments: payments.map((payment) => ({
        amount: payment.amount,
      })),
    }),
    [cart, parsedInvoiceTotal, payments, selectedCustomer],
  );

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: Number(product.price || 0),
        },
      ];
    });
    setSearchQuery('');
  };

  const updateQuantity = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === productId
            ? {
                ...item,
                quantity: Math.max(0, item.quantity + delta),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

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

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerQuery('');
  };

  const clearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery('');
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('pos')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Search products by name, SKU, or barcode, add them fast to cart, and collect flexible payments.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Smart product search</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Type product name, SKU, or barcode"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {searchQuery && (
            <List dense sx={{ mt: 1 }}>
              {searchableProducts.length > 0 ? (
                searchableProducts.map((product) => (
                  <ListItem
                    key={product.id}
                    disablePadding
                    secondaryAction={
                      <Button size="small" variant="contained" onClick={() => addToCart(product)}>
                        Add
                      </Button>
                    }
                  >
                    <ListItemButton onClick={() => addToCart(product)}>
                      <ListItemText
                        primary={product.name}
                        secondary={`${product.sku} • $${Number(product.price || 0).toFixed(2)}${product.barcode ? ` • ${product.barcode}` : ''}`}
                      />
                    </ListItemButton>
                  </ListItem>
                ))
              ) : (
                <ListItem>
                  <ListItemText primary="No products matched your search" />
                </ListItem>
              )}
            </List>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" sx={{ mb: 1 }}>{t('smart_customer_search')}</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder={t('pos_customer_search_placeholder')}
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
          />

          {selectedCustomer && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
              <Chip
                color="secondary"
                label={`${selectedCustomer.name}${selectedCustomer.phone ? ` • ${selectedCustomer.phone}` : ''}`}
              />
              <Button size="small" onClick={clearSelectedCustomer}>
                {t('clear_selected_customer')}
              </Button>
            </Stack>
          )}

          {customerQuery && (
            <List dense sx={{ mt: 1 }}>
              {searchableCustomers.length > 0 ? (
                searchableCustomers.map((customer) => (
                  <ListItem
                    key={customer.id}
                    disablePadding
                    secondaryAction={(
                      <Button size="small" variant="contained" onClick={() => handleSelectCustomer(customer)}>
                        {t('select_customer')}
                      </Button>
                    )}
                  >
                    <ListItemButton onClick={() => handleSelectCustomer(customer)}>
                      <ListItemText
                        primary={customer.name || t('unnamed_customer')}
                        secondary={customer.phone || t('no_phone')}
                      />
                    </ListItemButton>
                  </ListItem>
                ))
              ) : (
                <ListItem>
                  <ListItemText primary={t('no_customers_matched_search')} />
                </ListItem>
              )}
            </List>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" sx={{ mb: 1 }}>Cart</Typography>
          {cart.length === 0 ? (
            <Typography color="text.secondary">No items in cart yet.</Typography>
          ) : (
            <Stack spacing={1.2}>
              {cart.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography fontWeight={600}>{item.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.sku} • ${item.unitPrice.toFixed(2)} each
                      </Typography>
                    </Box>
                    <Chip label={`$${(item.quantity * item.unitPrice).toFixed(2)}`} color="primary" size="small" />
                  </Box>
                  <ButtonGroup size="small" sx={{ mt: 1 }}>
                    <Button onClick={() => updateQuantity(item.id, -1)}>-</Button>
                    <Button disabled>{item.quantity}</Button>
                    <Button onClick={() => updateQuantity(item.id, 1)}>+</Button>
                  </ButtonGroup>
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Payment</Typography>

          <TextField
            label={t('invoice_total')}
            type="number"
            value={invoiceTotal}
            inputProps={{ min: 0, step: '0.01' }}
            onChange={(e) => setInvoiceTotal(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />

          <TextField
            label={paymentInputMode === 'percentage' ? t('payment_percentage') : t('payment_amount')}
            type="number"
            value={paymentValue}
            inputProps={{ min: 0, step: '0.01' }}
            onChange={(e) => setPaymentValue(e.target.value)}
            fullWidth
          />

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

          <Button variant="contained" onClick={handleAddPayment} fullWidth>
            {t('record_payment')}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Typography>{t('amount_paid')}: ${paidSoFar.toFixed(2)}</Typography>
          <Typography>{t('remaining_balance')}: ${remaining.toFixed(2)}</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            {t('invoice_payload_customer_hint')}: {invoicePayload.customer_id || t('none')}
          </Typography>

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
      </Box>
    </Paper>
  );
}
