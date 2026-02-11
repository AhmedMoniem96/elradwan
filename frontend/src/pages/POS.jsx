import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
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
const MAX_GROUP_RESULTS = 5;
const MAX_TOTAL_RESULTS = 12;

const normalize = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const toDateTime = (value) => {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const scoreProductMatch = (product, queryTokens) => {
  const name = normalize(product.name);
  const sku = normalize(product.sku);
  const barcode = normalize(product.barcode);
  const categoryName = normalize(product.categoryName);

  if (queryTokens.length === 0) {
    return categoryName ? 5 : 0;
  }

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
    if (categoryName === token) {
      tokenScore = Math.max(tokenScore, 50);
    }
    if (categoryName.startsWith(token)) {
      tokenScore = Math.max(tokenScore, 36);
    }
    if (categoryName.includes(token)) {
      tokenScore = Math.max(tokenScore, 30);
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

const scoreCategoryMatch = (category, queryTokens) => {
  if (queryTokens.length === 0) {
    return 0;
  }

  const name = normalize(category.name);
  let score = 0;
  let matchedTokens = 0;

  queryTokens.forEach((token) => {
    let tokenScore = 0;
    if (name === token) {
      tokenScore = 95;
    } else if (name.startsWith(token)) {
      tokenScore = 70;
    } else if (name.includes(token)) {
      tokenScore = 45;
    }

    if (tokenScore > 0) {
      matchedTokens += 1;
      score += tokenScore;
    }
  });

  if (matchedTokens === queryTokens.length) {
    score += 25;
  }

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
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [error, setError] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState('0');
  const [paymentInputMode, setPaymentInputMode] = useState('amount');
  const [paymentValue, setPaymentValue] = useState('0');
  const [payments, setPayments] = useState([]);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState('');
  const [receiptQuickFilter, setReceiptQuickFilter] = useState('');
  const [activeReceipt, setActiveReceipt] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('/api/v1/products/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setProducts(payload.filter((product) => product.is_active !== false));
        setError('');
      } catch (err) {
        console.error('Failed to load products for POS', err);
        setError(t('pos_load_products_error'));
      }
    };

    fetchProducts();

    const fetchCategories = async () => {
      try {
        const response = await axios.get('/api/v1/categories/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setCategories(payload);
      } catch (err) {
        console.error('Failed to load categories for POS', err);
      }
    };

    fetchCategories();

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
  }, [t]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [String(category.id), category])),
    [categories],
  );

  const indexedProducts = useMemo(
    () =>
      products.map((product) => {
        const fallbackCategoryName =
          typeof product.category === 'object' ? product.category?.name : product.category_name;
        const categoryId =
          product.category_id
          || (typeof product.category === 'object' ? product.category?.id : product.category);
        const categoryName =
          categoriesById.get(String(categoryId))?.name || fallbackCategoryName || '';

        return {
          ...product,
          categoryId,
          categoryName,
          searchIndex: [product.name, product.sku, product.barcode, categoryName]
            .map(normalize)
            .filter(Boolean)
            .join(' '),
        };
      }),
    [products, categoriesById],
  );

  const indexedCategories = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        searchIndex: normalize(category.name),
      })),
    [categories],
  );

  const indexedCustomers = useMemo(
    () =>
      customers.map((customer) => ({
        ...customer,
        searchIndex: `${normalize(customer.name)} ${normalizePhone(customer.phone)}`,
      })),
    [customers],
  );

  const searchGroups = useMemo(() => {
    const query = normalize(searchQuery);
    const queryTokens = query.split(/\s+/).filter(Boolean);

    const filteredProducts = activeCategoryId
      ? indexedProducts.filter((product) => String(product.categoryId) === String(activeCategoryId))
      : indexedProducts;

    const matchedProducts = filteredProducts
      .map((product) => ({
        product,
        score: scoreProductMatch(product, queryTokens),
      }))
      .filter((item) => item.score > 0)
      .map((item) => ({
        ...item,
        score:
          activeCategoryId && String(item.product.categoryId) === String(activeCategoryId)
            ? item.score + 40
            : item.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_GROUP_RESULTS)
      .map((item) => item.product);

    const matchedCategories = query
      ? indexedCategories
          .map((category) => ({
            category,
            score: scoreCategoryMatch(category, queryTokens),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_GROUP_RESULTS)
          .map((item) => item.category)
      : [];

    const matchedCustomers = query
      ? indexedCustomers
          .map((customer) => ({
            customer,
            score: scoreCustomerMatch(customer, query),
          }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_GROUP_RESULTS)
          .map((item) => item.customer)
      : [];

    const grouped = [
      { key: 'products', label: t('pos_search_products_group'), items: matchedProducts, type: 'product' },
      { key: 'categories', label: t('pos_search_categories_group'), items: matchedCategories, type: 'category' },
      { key: 'customers', label: t('pos_search_customers_group'), items: matchedCustomers, type: 'customer' },
    ];

    let remaining = MAX_TOTAL_RESULTS;
    return grouped
      .map((group) => {
        if (remaining <= 0) {
          return { ...group, items: [] };
        }
        const limitedItems = group.items.slice(0, remaining);
        remaining -= limitedItems.length;
        return { ...group, items: limitedItems };
      })
      .filter((group) => group.items.length > 0);
  }, [activeCategoryId, indexedCategories, indexedCustomers, indexedProducts, searchQuery, t]);

  const flatResults = useMemo(
    () =>
      searchGroups.flatMap((group) =>
        group.items.map((item) => ({
          type: group.type,
          item,
        })),
      ),
    [searchGroups],
  );

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
      .slice(0, MAX_GROUP_RESULTS)
      .map((item) => item.customer);
  }, [customerQuery, customers]);

  useEffect(() => {
    setActiveResultIndex(0);
  }, [searchQuery, activeCategoryId]);

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

  const filteredReceipts = useMemo(() => {
    const query = normalize(receiptQuickFilter);
    const queryPhone = normalizePhone(receiptQuickFilter);
    if (!query && !queryPhone) {
      return receipts;
    }

    return receipts.filter((receipt) => {
      const receiptNo = normalize(receipt.invoice_number || receipt.local_invoice_no);
      const customerPhone = normalizePhone(receipt.customer?.phone);
      return (
        (query && receiptNo.includes(query))
        || (queryPhone && customerPhone.includes(queryPhone))
      );
    });
  }, [receiptQuickFilter, receipts]);

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

  const handleSelectCategory = (category) => {
    setActiveCategoryId(category.id);
    setSearchQuery(category.name || '');
    setActiveResultIndex(0);
  };

  const clearCategoryFilter = () => {
    setActiveCategoryId(null);
  };

  const activateResult = (result) => {
    if (!result) {
      return;
    }
    if (result.type === 'product') {
      addToCart(result.item);
      return;
    }
    if (result.type === 'category') {
      handleSelectCategory(result.item);
      return;
    }
    if (result.type === 'customer') {
      handleSelectCustomer(result.item);
    }
  };

  const loadReceipts = async () => {
    setReceiptsLoading(true);
    setReceiptsError('');
    try {
      const response = await axios.get('/api/v1/invoices/');
      const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
      setReceipts(payload);
    } catch (err) {
      console.error('Failed to load receipts', err);
      setReceiptsError(t('pos_receipts_load_error'));
    } finally {
      setReceiptsLoading(false);
    }
  };

  const openReceiptsPanel = () => {
    setReceiptsOpen(true);
    setActiveReceipt(null);
    loadReceipts();
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {t('pos')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('pos_intro_text')}
      </Typography>

      <Button variant="outlined" sx={{ mb: 2 }} onClick={openReceiptsPanel}>
        {t('pos_receipts_open')}
      </Button>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>{t('pos_smart_product_search')}</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder={t('pos_product_search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(event) => {
              if (!flatResults.length) {
                return;
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveResultIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveResultIndex((prev) => Math.max(prev - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                activateResult(flatResults[activeResultIndex]);
              }
            }}
          />

          {activeCategoryId && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
              <Chip
                color="primary"
                label={`${t('pos_category_filter_label')}: ${categoriesById.get(String(activeCategoryId))?.name || activeCategoryId}`}
              />
              <Button size="small" onClick={clearCategoryFilter}>{t('clear')}</Button>
            </Stack>
          )}

          {(searchQuery || activeCategoryId) && (
            <List dense sx={{ mt: 1 }}>
              {searchGroups.length > 0 ? (
                searchGroups.map((group) => (
                  <Box key={group.key}>
                    <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 1, display: 'block' }}>
                      {group.label}
                    </Typography>
                    {group.items.map((entry) => {
                      const flatIndex = flatResults.findIndex((result) => result.item.id === entry.id && result.type === group.type);
                      const isActive = flatIndex === activeResultIndex;
                      if (group.type === 'product') {
                        return (
                          <ListItem
                            key={`product-${entry.id}`}
                            disablePadding
                            secondaryAction={
                              <Button size="small" variant="contained" onClick={() => addToCart(entry)}>
                                {t('add')}
                              </Button>
                            }
                          >
                            <ListItemButton selected={isActive} onClick={() => addToCart(entry)}>
                              <ListItemAvatar>
                                <Avatar variant="rounded" src={entry.image_url || ''} alt={entry.name} sx={{ width: 36, height: 36 }} />
                              </ListItemAvatar>
                              <ListItemText
                                primary={entry.name}
                                secondary={`${entry.sku} • ${formatMoney(entry.price)}${entry.barcode ? ` • ${entry.barcode}` : ''}${entry.categoryName ? ` • ${entry.categoryName}` : ''}`}
                                sx={{ textAlign: isRTL ? 'right' : 'left' }}
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      }

                      if (group.type === 'category') {
                        return (
                          <ListItem key={`category-${entry.id}`} disablePadding>
                            <ListItemButton selected={isActive} onClick={() => handleSelectCategory(entry)}>
                              <ListItemText
                                primary={entry.name}
                                secondary={t('pos_filter_products_by_category')}
                                sx={{ textAlign: isRTL ? 'right' : 'left' }}
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      }

                      return (
                        <ListItem
                          key={`customer-${entry.id}`}
                          disablePadding
                          secondaryAction={(
                            <Button size="small" variant="contained" onClick={() => handleSelectCustomer(entry)}>
                              {t('select_customer')}
                            </Button>
                          )}
                        >
                          <ListItemButton selected={isActive} onClick={() => handleSelectCustomer(entry)}>
                            <ListItemText
                              primary={entry.name || t('unnamed_customer')}
                              secondary={entry.phone || t('no_phone')}
                              sx={{ textAlign: isRTL ? 'right' : 'left' }}
                            />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </Box>
                ))
              ) : (
                  <ListItem>
                  <ListItemText primary={t('pos_no_search_results')} />
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

          <Typography variant="subtitle1" sx={{ mb: 1 }}>{t('cart')}</Typography>
          {cart.length === 0 ? (
            <Typography color="text.secondary">{t('pos_cart_empty')}</Typography>
          ) : (
            <Stack spacing={1.2}>
              {cart.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Box>
                      <Typography fontWeight={600}>{item.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.sku} • {formatMoney(item.unitPrice)} {t('pos_each')}
                      </Typography>
                    </Box>
                    <Chip label={formatMoney(item.quantity * item.unitPrice)} color="primary" size="small" />
                  </Box>
                  <ButtonGroup size="small" sx={{ mt: 1, direction: isRTL ? 'rtl' : 'ltr' }}>
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
          <Typography variant="h6" sx={{ mb: 2 }}>{t('payment')}</Typography>

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

          <Typography sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('amount_paid')}: {formatMoney(paidSoFar)}</Typography>
          <Typography sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('remaining_balance')}: {formatMoney(remaining)}</Typography>
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

      <Dialog
        open={receiptsOpen}
        onClose={() => setReceiptsOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>{t('pos_receipts_history')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ py: 1 }}>
            <TextField
              size="small"
              label={t('pos_receipts_quick_filter')}
              placeholder={t('pos_receipts_quick_filter_placeholder')}
              value={receiptQuickFilter}
              onChange={(event) => setReceiptQuickFilter(event.target.value)}
            />

            {receiptsError && <Alert severity="error">{receiptsError}</Alert>}
            {receiptsLoading && <Typography color="text.secondary">{t('pos_receipts_loading')}</Typography>}

            {!receiptsLoading && filteredReceipts.length === 0 && (
              <Typography color="text.secondary">{t('pos_receipts_empty')}</Typography>
            )}

            {filteredReceipts.map((receipt) => (
              <Paper key={receipt.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={0.5}>
                  <Typography fontWeight={600}>
                    {t('pos_receipt_number')}: {receipt.invoice_number || receipt.local_invoice_no || t('none')}
                  </Typography>
                  <Typography variant="body2">{t('pos_receipt_datetime')}: {toDateTime(receipt.created_at)}</Typography>
                  <Typography variant="body2">{t('pos_receipt_cashier')}: {receipt.user || t('none')}</Typography>
                  <Typography variant="body2">{t('pos_receipt_customer')}: {receipt.customer?.name || t('unnamed_customer')}</Typography>
                  <Typography variant="body2">{t('phone')}: {receipt.customer?.phone || t('no_phone')}</Typography>
                  <Typography variant="body2">
                    {t('pos_receipt_line_items')}: {(receipt.lines || []).map((line) => `#${line.product} × ${line.quantity}`).join(', ') || t('none')}
                  </Typography>
                  <Typography variant="body2">
                    {t('pos_receipt_totals')}: {formatMoney(receipt.total)}
                    {' • '}
                    {t('pos_receipt_discount')}: {formatMoney(receipt.discount_total)}
                    {' • '}
                    {t('pos_receipt_tax')}: {formatMoney(receipt.tax_total)}
                  </Typography>
                  <Typography variant="body2">
                    {t('amount_paid')}: {formatMoney(receipt.amount_paid)}
                    {' • '}
                    {t('pos_receipt_balance')}: {formatMoney(receipt.balance_due)}
                  </Typography>
                  <Typography variant="body2">
                    {t('pos_receipt_payment_methods')}: {(receipt.payments || []).map((paymentEntry) => paymentEntry.method).join(', ') || t('none')}
                  </Typography>
                  <Typography variant="body2">
                    {t('pos_receipt_returns')}: {(receipt.returns || []).length}
                  </Typography>
                  <Box>
                    <Button size="small" onClick={() => setActiveReceipt(receipt)}>
                      {t('pos_open_receipt_details')}
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeReceipt)}
        onClose={() => setActiveReceipt(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t('pos_receipt_details')}</DialogTitle>
        <DialogContent>
          {activeReceipt && (
            <Stack spacing={1.2} sx={{ py: 1 }}>
              <Typography>{t('pos_receipt_number')}: {activeReceipt.invoice_number || activeReceipt.local_invoice_no || t('none')}</Typography>
              <Typography>{t('pos_receipt_datetime')}: {toDateTime(activeReceipt.created_at)}</Typography>
              <Typography>{t('pos_receipt_cashier')}: {activeReceipt.user || t('none')}</Typography>
              <Typography>{t('pos_receipt_customer')}: {activeReceipt.customer?.name || t('unnamed_customer')}</Typography>
              <Typography>{t('phone')}: {activeReceipt.customer?.phone || t('no_phone')}</Typography>
              <Divider />
              <Typography fontWeight={600}>{t('pos_receipt_line_items')}</Typography>
              {(activeReceipt.lines || []).length > 0 ? (
                activeReceipt.lines.map((line) => (
                  <Typography key={line.id} variant="body2">
                    #{line.product} • {line.quantity} × {formatMoney(line.unit_price)} • {t('pos_receipt_discount')} {formatMoney(line.discount)} • {t('pos_receipt_tax')} {Number(line.tax_rate || 0) * 100}% • {t('pos_receipt_totals')} {formatMoney(line.line_total)}
                  </Typography>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">{t('none')}</Typography>
              )}
              <Divider />
              <Typography>{t('pos_receipt_totals')}: {formatMoney(activeReceipt.total)}</Typography>
              <Typography>{t('pos_receipt_discount')}: {formatMoney(activeReceipt.discount_total)}</Typography>
              <Typography>{t('pos_receipt_tax')}: {formatMoney(activeReceipt.tax_total)}</Typography>
              <Typography>{t('amount_paid')}: {formatMoney(activeReceipt.amount_paid)}</Typography>
              <Typography>{t('pos_receipt_balance')}: {formatMoney(activeReceipt.balance_due)}</Typography>
              <Typography>{t('pos_receipt_payment_methods')}: {(activeReceipt.payments || []).map((paymentEntry) => `${paymentEntry.method} (${formatMoney(paymentEntry.amount)})`).join(', ') || t('none')}</Typography>
              <Typography>{t('pos_receipt_returns')}: {(activeReceipt.returns || []).length}</Typography>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
}
