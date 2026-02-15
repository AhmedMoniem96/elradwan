import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

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

    if (name === token) tokenScore = Math.max(tokenScore, 120);
    if (sku === token || barcode === token) tokenScore = Math.max(tokenScore, 110);
    if (name.startsWith(token)) tokenScore = Math.max(tokenScore, 80);
    if (sku.startsWith(token) || barcode.startsWith(token)) tokenScore = Math.max(tokenScore, 75);
    if (name.includes(token)) tokenScore = Math.max(tokenScore, 60);
    if (sku.includes(token) || barcode.includes(token)) tokenScore = Math.max(tokenScore, 55);
    if (categoryName === token) tokenScore = Math.max(tokenScore, 50);
    if (categoryName.startsWith(token)) tokenScore = Math.max(tokenScore, 36);
    if (categoryName.includes(token)) tokenScore = Math.max(tokenScore, 30);

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
  if (queryTokens.length === 0) return 0;

  const name = normalize(category.name);
  let score = 0;
  let matchedTokens = 0;

  queryTokens.forEach((token) => {
    let tokenScore = 0;
    if (name === token) tokenScore = 95;
    else if (name.startsWith(token)) tokenScore = 70;
    else if (name.includes(token)) tokenScore = 45;

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
    if (customerPhone === normalizedPhoneQuery) score = Math.max(score, 1200);
    else if (customerPhone.startsWith(normalizedPhoneQuery)) score = Math.max(score, 900);
    else if (customerPhone.includes(normalizedPhoneQuery)) score = Math.max(score, 700);
  }

  if (normalizedQuery && customerName.includes(normalizedQuery)) {
    score = Math.max(score, 450);
  }

  score -= Math.min(customerName.length, 40) / 20;
  return score;
};

function SectionCard({ title, subtitle, children, accent }) {
  return (
    <Card variant="outlined" sx={{ borderColor: accent || 'divider' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            {subtitle ? (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function POS() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
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
  const [isTotalManuallyOverridden, setIsTotalManuallyOverridden] = useState(false);
  const [paymentInputMode, setPaymentInputMode] = useState('amount');
  const [paymentValue, setPaymentValue] = useState('0');
  const [payments, setPayments] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [actionFeedback, setActionFeedback] = useState({ severity: '', message: '' });

  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState('');
  const [receiptQuickFilter, setReceiptQuickFilter] = useState('');
  const [activeReceipt, setActiveReceipt] = useState(null);

  useEffect(() => {
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        const response = await axios.get('/api/v1/products/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setProducts(payload.filter((product) => product.is_active !== false));
        setError('');
      } catch (err) {
        console.error('Failed to load products for POS', err);
        setError(t('pos_load_products_error'));
      } finally {
        setProductsLoading(false);
      }
    };

    const fetchCategories = async () => {
      try {
        const response = await axios.get('/api/v1/categories/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setCategories(payload);
      } catch (err) {
        console.error('Failed to load categories for POS', err);
      }
    };

    const fetchCustomers = async () => {
      setCustomersLoading(true);
      try {
        const response = await axios.get('/api/v1/customers/');
        const payload = Array.isArray(response.data) ? response.data : response.data.results || [];
        setCustomers(payload);
      } catch (err) {
        console.error('Failed to load customers for POS', err);
      } finally {
        setCustomersLoading(false);
      }
    };

    fetchProducts();
    fetchCategories();
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
        const categoryName = categoriesById.get(String(categoryId))?.name || fallbackCategoryName || '';

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
    () => categories.map((category) => ({ ...category, searchIndex: normalize(category.name) })),
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
      .map((product) => ({ product, score: scoreProductMatch(product, queryTokens) }))
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
          .map((category) => ({ category, score: scoreCategoryMatch(category, queryTokens) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_GROUP_RESULTS)
          .map((item) => item.category)
      : [];

    const matchedCustomers = query
      ? indexedCustomers
          .map((customer) => ({ customer, score: scoreCustomerMatch(customer, query) }))
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
        if (remaining <= 0) return { ...group, items: [] };
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

  const parsedInvoiceTotal = useMemo(() => {
    const normalizedCartSubtotal = Number(cartSubtotal.toFixed(2));
    if (!isTotalManuallyOverridden) {
      return normalizedCartSubtotal;
    }

    const enteredTotal = Number(invoiceTotal);
    return enteredTotal > 0 ? enteredTotal : normalizedCartSubtotal;
  }, [cartSubtotal, invoiceTotal, isTotalManuallyOverridden]);

  useEffect(() => {
    if (!isTotalManuallyOverridden) {
      setInvoiceTotal(cartSubtotal.toFixed(2));
    }
  }, [cartSubtotal, isTotalManuallyOverridden]);

  const paidSoFar = useMemo(() => payments.reduce((acc, p) => acc + p.amount, 0), [payments]);
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
    if (!query) return [];

    return customers
      .map((customer) => ({ customer, score: scoreCustomerMatch(customer, query) }))
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
      payments: payments.map((payment) => ({ amount: payment.amount })),
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
      return (query && receiptNo.includes(query)) || (queryPhone && customerPhone.includes(queryPhone));
    });
  }, [receiptQuickFilter, receipts]);

  const addToCart = (product) => {
    setCart((prev) => {
      let nextCart;
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        nextCart = prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      } else {
        nextCart = [
          ...prev,
          {
            id: product.id,
            name: product.name,
            sku: product.sku,
            quantity: 1,
            unitPrice: Number(product.price || 0),
          },
        ];
      }

      if (!isTotalManuallyOverridden) {
        const nextSubtotal = nextCart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
        setInvoiceTotal(nextSubtotal.toFixed(2));
      }

      return nextCart;
    });
    setActionFeedback({ severity: 'success', message: t('pos_item_added', { defaultValue: 'Item added to cart.' }) });
    setSearchQuery('');
  };

  const updateQuantity = (productId, delta) => {
    setCart((prev) => {
      const nextCart = prev
        .map((item) =>
          item.id === productId
            ? {
                ...item,
                quantity: Math.max(0, item.quantity + delta),
              }
            : item,
        )
        .filter((item) => item.quantity > 0);

      if (!isTotalManuallyOverridden) {
        const nextSubtotal = nextCart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
        setInvoiceTotal(nextSubtotal.toFixed(2));
      }

      return nextCart;
    });
  };

  const handleAddPayment = () => {
    if (computedPaymentAmount <= 0) {
      setActionFeedback({
        severity: 'error',
        message: t('pos_payment_invalid', { defaultValue: 'Enter a valid payment amount.' }),
      });
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
    setActionFeedback({
      severity: 'success',
      message: t('pos_payment_recorded', { defaultValue: 'Payment recorded successfully.' }),
    });
  };

  const handleCompleteSale = async () => {
    if (!cart.length || remaining > 0 || isCompletingSale) {
      return;
    }

    setIsCompletingSale(true);
    setActionFeedback({ severity: '', message: '' });
    try {
      await axios.post('/api/v1/invoices/', invoicePayload);
      setCart([]);
      setPayments([]);
      setSelectedCustomer(null);
      setSearchQuery('');
      setCustomerQuery('');
      setInvoiceTotal('0');
      setIsTotalManuallyOverridden(false);
      setActionFeedback({
        severity: 'success',
        message: t('pos_sale_completed', { defaultValue: 'Sale completed successfully.' }),
      });
    } catch (err) {
      console.error('Failed to complete sale', err);
      setActionFeedback({
        severity: 'error',
        message: t('pos_complete_sale_error', { defaultValue: 'Unable to complete sale. Please try again.' }),
      });
    } finally {
      setIsCompletingSale(false);
    }
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
    if (!result) return;
    if (result.type === 'product') return addToCart(result.item);
    if (result.type === 'category') return handleSelectCategory(result.item);
    if (result.type === 'customer') return handleSelectCustomer(result.item);
    return null;
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

  const canCheckout = cart.length > 0 && remaining === 0 && payments.length > 0;

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h4">{t('pos')}</Typography>
          <Typography color="text.secondary">{t('pos_intro_text')}</Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="outlined" onClick={openReceiptsPanel}>
            {t('pos_receipts_open')}
          </Button>
          {can('inventory.view') && (
            <Button variant="outlined" onClick={() => navigate('/suppliers')}>
              {t('pos_open_suppliers')}
            </Button>
          )}
          <Button
            variant="contained"
            color={canCheckout ? 'success' : 'primary'}
            disabled={!canCheckout || isCompletingSale}
            onClick={handleCompleteSale}
          >
            {isCompletingSale
              ? t('pos_completing_sale', { defaultValue: 'Completing Sale...' })
              : t('pos_complete_sale', { defaultValue: 'Complete Sale' })}
          </Button>
        </Stack>

        {!!error && <Alert severity="error">{error}</Alert>}
        {!!actionFeedback.message && (
          <Alert severity={actionFeedback.severity || 'info'}>{actionFeedback.message}</Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: '1.35fr 1fr' },
            alignItems: 'start',
          }}
        >
          <Stack spacing={2}>
            <SectionCard
              title={t('pos_smart_product_search')}
              subtitle={t('pos_product_search_placeholder')}
              accent="primary.main"
            >
              <TextField
                fullWidth
                size="medium"
                placeholder={t('pos_product_search_placeholder')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (!flatResults.length) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActiveResultIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActiveResultIndex((prev) => Math.max(prev - 1, 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    activateResult(flatResults[activeResultIndex] || flatResults[0]);
                  }
                }}
              />

              {activeCategoryId && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    color="primary"
                    label={`${t('pos_category_filter_label')}: ${categoriesById.get(String(activeCategoryId))?.name || activeCategoryId}`}
                  />
                  <Button size="small" onClick={clearCategoryFilter}>
                    {t('clear')}
                  </Button>
                </Stack>
              )}

              {productsLoading ? (
                <Stack spacing={1}>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={`search-skeleton-${index + 1}`} variant="rounded" height={54} />
                  ))}
                </Stack>
              ) : (searchQuery || activeCategoryId) ? (
                <List dense sx={{ p: 0 }}>
                  {searchGroups.length > 0 ? (
                    searchGroups.map((group) => (
                      <Box key={group.key}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ px: 1, pt: 1, display: 'block', textAlign: isRTL ? 'right' : 'left' }}
                        >
                          {group.label}
                        </Typography>
                        {group.items.map((entry) => {
                          const flatIndex = flatResults.findIndex(
                            (result) => result.item.id === entry.id && result.type === group.type,
                          );
                          const isActive = flatIndex === activeResultIndex;
                          if (group.type === 'product') {
                            return (
                              <ListItem
                                key={`product-${entry.id}`}
                                disablePadding
                                secondaryAction={(
                                  <Button
                                    size="medium"
                                    variant="contained"
                                    sx={{ minWidth: 84 }}
                                    onClick={() => addToCart(entry)}
                                  >
                                    {t('add')}
                                  </Button>
                                )}
                              >
                                <ListItemButton selected={isActive} onClick={() => addToCart(entry)}>
                                  <ListItemAvatar>
                                    <Avatar
                                      variant="rounded"
                                      src={entry.image_url || ''}
                                      alt={entry.name}
                                      sx={{ width: 40, height: 40 }}
                                    />
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
              ) : (
                <Alert severity="info">{t('pos_quick_add_hint', { defaultValue: 'Search products then press Enter to add the top result.' })}</Alert>
              )}
            </SectionCard>

            <SectionCard title={t('cart')} subtitle={t('pos_cart_empty')} accent="warning.main">
              {cart.length === 0 ? (
                <Alert severity="info">{t('pos_cart_empty')}</Alert>
              ) : (
                <Stack spacing={1.2}>
                  {cart.map((item) => (
                    <Card key={item.id} variant="outlined">
                      <CardContent sx={{ p: 1.5 }}>
                        <Stack spacing={1}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexDirection: isRTL ? 'row-reverse' : 'row',
                              gap: 1,
                            }}
                          >
                            <Box>
                              <Typography variant="subtitle1" fontWeight={700}>
                                {item.name}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {item.sku} • {formatMoney(item.unitPrice)} {t('pos_each')}
                              </Typography>
                            </Box>
                            <Chip label={formatMoney(item.quantity * item.unitPrice)} color="primary" />
                          </Box>
                          <ButtonGroup
                            size="large"
                            sx={{
                              direction: isRTL ? 'rtl' : 'ltr',
                              '& .MuiButton-root': { minWidth: 56, fontWeight: 700 },
                            }}
                          >
                            <Button color="error" onClick={() => updateQuantity(item.id, -1)}>-</Button>
                            <Button disabled>{item.quantity}</Button>
                            <Button color="success" onClick={() => updateQuantity(item.id, 1)}>+</Button>
                          </ButtonGroup>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </SectionCard>
          </Stack>

          <Stack spacing={2} sx={{ position: { xs: 'sticky', md: 'static' }, bottom: { xs: 8, md: 'auto' } }}>
            <SectionCard title={t('payment')} subtitle={t('remaining_balance')} accent="success.main">
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  label={t('invoice_total')}
                  type="number"
                  value={invoiceTotal}
                  inputProps={{ min: 0, step: '0.01' }}
                  onChange={(event) => {
                    setIsTotalManuallyOverridden(true);
                    setInvoiceTotal(event.target.value);
                  }}
                  fullWidth
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    setInvoiceTotal(cartSubtotal.toFixed(2));
                    setIsTotalManuallyOverridden(false);
                  }}
                >
                  {t('pos_reset_to_cart_total', { defaultValue: 'Reset to cart total' })}
                </Button>
              </Stack>

              <TextField
                label={paymentInputMode === 'percentage' ? t('payment_percentage') : t('payment_amount')}
                type="number"
                value={paymentValue}
                inputProps={{ min: 0, step: '0.01' }}
                onChange={(event) => setPaymentValue(event.target.value)}
                fullWidth
              />

              <Stack spacing={1}>
                <ButtonGroup variant="outlined" fullWidth>
                  <Button onClick={() => setPaymentInputMode('amount')}>{t('payment_amount')}</Button>
                  <Button onClick={() => setPaymentInputMode('percentage')}>{t('payment_percentage')}</Button>
                </ButtonGroup>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {PERCENTAGE_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      size="small"
                      variant="contained"
                      color="secondary"
                      onClick={() => {
                        setPaymentInputMode('percentage');
                        setPaymentValue(String(preset));
                      }}
                    >
                      {preset}%
                    </Button>
                  ))}
                </Stack>
              </Stack>

              <Button variant="contained" color="success" onClick={handleAddPayment} fullWidth size="large">
                {t('record_payment')}
              </Button>

              <Divider />

              <Typography sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                {t('amount_paid')}: {formatMoney(paidSoFar)}
              </Typography>
              <Typography sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                {t('remaining_balance')}: {formatMoney(remaining)}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {t('invoice_payload_customer_hint')}: {invoicePayload.customer_id || t('none')}
              </Typography>

              <List>
                {payments.length === 0 ? (
                  <ListItem>
                    <ListItemText
                      primary={t('pos_no_payments', { defaultValue: 'No payments recorded yet.' })}
                      sx={{ textAlign: isRTL ? 'right' : 'left' }}
                    />
                  </ListItem>
                ) : (
                  payments.map((payment, index) => (
                    <ListItem key={payment.id} divider>
                      <ListItemText
                        primary={`${t('payment')} #${index + 1}`}
                        secondary={`${payment.label} → ${formatMoney(payment.amount)}`}
                        sx={{ textAlign: isRTL ? 'right' : 'left' }}
                      />
                    </ListItem>
                  ))
                )}
              </List>
            </SectionCard>

            <SectionCard
              title={t('pos_receipt_summary', { defaultValue: 'Receipt / Customer Summary' })}
              subtitle={t('smart_customer_search')}
            >
              <TextField
                fullWidth
                size="small"
                placeholder={t('pos_customer_search_placeholder')}
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
              />

              {selectedCustomer && (
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Chip
                    color="secondary"
                    label={`${selectedCustomer.name}${selectedCustomer.phone ? ` • ${selectedCustomer.phone}` : ''}`}
                  />
                  <Button size="small" onClick={clearSelectedCustomer}>
                    {t('clear_selected_customer')}
                  </Button>
                </Stack>
              )}

              {customersLoading ? (
                <Stack spacing={1}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={`customer-skeleton-${index + 1}`} variant="rounded" height={44} />
                  ))}
                </Stack>
              ) : customerQuery ? (
                <List dense sx={{ p: 0 }}>
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
                            sx={{ textAlign: isRTL ? 'right' : 'left' }}
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
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  {t('invoice_payload_customer_hint')}: {selectedCustomer?.id || t('none')}
                </Typography>
              )}

              <Divider />
              <Typography variant="body2" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                {t('invoice_total')}: {formatMoney(parsedInvoiceTotal)}
              </Typography>
              <Typography variant="body2" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                {t('cart')}: {cart.length}
              </Typography>
              <Typography variant="body2" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                {t('amount_paid')}: {formatMoney(paidSoFar)}
              </Typography>
            </SectionCard>
          </Stack>
        </Box>
      </Stack>

      <Dialog open={receiptsOpen} onClose={() => setReceiptsOpen(false)} fullWidth maxWidth="lg">
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
              <Card key={receipt.id} variant="outlined">
                <CardContent sx={{ p: 1.5 }}>
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
                      {t('pos_receipt_totals')}: {formatMoney(receipt.total)} • {t('pos_receipt_discount')}: {formatMoney(receipt.discount_total)} • {t('pos_receipt_tax')}: {formatMoney(receipt.tax_total)}
                    </Typography>
                    <Typography variant="body2">
                      {t('amount_paid')}: {formatMoney(receipt.amount_paid)} • {t('pos_receipt_balance')}: {formatMoney(receipt.balance_due)}
                    </Typography>
                    <Typography variant="body2">
                      {t('pos_receipt_payment_methods')}: {(receipt.payments || []).map((paymentEntry) => paymentEntry.method).join(', ') || t('none')}
                    </Typography>
                    <Typography variant="body2">{t('pos_receipt_returns')}: {(receipt.returns || []).length}</Typography>
                    <Box>
                      <Button size="small" onClick={() => setActiveReceipt(receipt)}>
                        {t('pos_open_receipt_details')}
                      </Button>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeReceipt)} onClose={() => setActiveReceipt(null)} fullWidth maxWidth="md">
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
              <Typography>
                {t('pos_receipt_payment_methods')}: {(activeReceipt.payments || []).map((paymentEntry) => `${paymentEntry.method} (${formatMoney(paymentEntry.amount)})`).join(', ') || t('none')}
              </Typography>
              <Typography>{t('pos_receipt_returns')}: {(activeReceipt.returns || []).length}</Typography>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
