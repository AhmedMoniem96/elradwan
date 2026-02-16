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
  FormHelperText,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { PageHeader, PageShell, SectionPanel } from '../components/PageLayout';
import { formatCurrency, formatDateTime, formatNumber } from '../utils/formatters';

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'wallet', 'other'];
const MAX_GROUP_RESULTS = 5;
const MAX_TOTAL_RESULTS = 12;
const HELD_CARTS_STORAGE_KEY = 'pos_held_carts_v1';

const normalize = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const toAmount = (value) => Number(Number(value || 0).toFixed(2));

const clampNumber = (value, min, max) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
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
    <SectionPanel
      title={title}
      subtitle={subtitle}
      contentSx={{
        border: '1px solid',
        borderColor: accent || 'divider',
        borderRadius: 3,
        background: (theme) => `linear-gradient(165deg, ${theme.palette.background.paper} 0%, ${theme.palette.action.hover} 100%)`,
        boxShadow: (theme) => `0 20px 40px ${theme.palette.action.selected}`,
      }}
    >
      <Stack spacing={2}>
        {children}
      </Stack>
    </SectionPanel>
  );
}

function ProductSearchPanel(props) {
  const {
    t,
    isRTL,
    searchQuery,
    setSearchQuery,
    flatResults,
    activeResultIndex,
    setActiveResultIndex,
    activateResult,
    activeCategoryId,
    categoriesById,
    clearCategoryFilter,
    productsLoading,
    searchGroups,
    addToCart,
    handleSelectCategory,
    handleSelectCustomer,
  } = props;

  return (
    <SectionCard title={t('pos_smart_product_search')} subtitle={t('pos_product_search_placeholder')} accent="primary.main">
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
          <Button size="small" color="warning" onClick={clearCategoryFilter}>{t('clear')}</Button>
        </Stack>
      )}

      <Box sx={{ maxHeight: { xs: '30vh', md: '42vh' }, overflowY: 'auto' }}>
        {productsLoading ? (
          <LoadingState
            icon={Inventory2OutlinedIcon}
            title={t('pos_receipts_loading')}
            helperText={t('pos_load_products_error', { defaultValue: 'بنحمّل المنتجات حالاً...' })}
          />
        ) : (searchQuery || activeCategoryId) ? (
          <List dense sx={{ p: 0 }}>
            {searchGroups.length > 0 ? (
              searchGroups.map((group) => (
                <Box key={group.key}>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1, pt: 1, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>{group.label}</Typography>
                  {group.items.map((entry) => {
                    const flatIndex = flatResults.findIndex((result) => result.item.id === entry.id && result.type === group.type);
                    const isActive = flatIndex === activeResultIndex;
                    if (group.type === 'product') {
                      return (
                        <ListItem key={`product-${entry.id}`} disablePadding secondaryAction={<Button size="small" variant="contained" color="primary" onClick={() => addToCart(entry)}>{t('add')}</Button>}>
                          <ListItemButton selected={isActive} onClick={() => addToCart(entry)}>
                            <ListItemAvatar>
                              <Avatar variant="rounded" src={entry.image_url || ''} alt={entry.name} sx={{ width: 36, height: 36 }} />
                            </ListItemAvatar>
                            <ListItemText primary={entry.name} secondary={`${entry.sku} • ${formatCurrency(entry.price)}`} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                          </ListItemButton>
                        </ListItem>
                      );
                    }
                    if (group.type === 'category') {
                      return (
                        <ListItem key={`category-${entry.id}`} disablePadding>
                          <ListItemButton selected={isActive} onClick={() => handleSelectCategory(entry)}>
                            <ListItemText primary={entry.name} secondary={t('pos_filter_products_by_category')} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                          </ListItemButton>
                        </ListItem>
                      );
                    }
                    return (
                      <ListItem key={`customer-${entry.id}`} disablePadding secondaryAction={<Button size="small" variant="contained" color="primary" onClick={() => handleSelectCustomer(entry)}>{t('select_customer')}</Button>}>
                        <ListItemButton selected={isActive} onClick={() => handleSelectCustomer(entry)}>
                          <ListItemText primary={entry.name || t('unnamed_customer')} secondary={entry.phone || t('no_phone')} sx={{ textAlign: isRTL ? 'right' : 'left' }} />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </Box>
              ))
            ) : (
              <EmptyState icon={Inventory2OutlinedIcon} title={t('pos_no_search_results')} helperText={t('pos_quick_add_hint', { defaultValue: 'جرّب اسم منتج تاني أو SKU أو باركود.' })} />
            )}
          </List>
        ) : (
          <EmptyState icon={Inventory2OutlinedIcon} title={t('pos_smart_product_search')} helperText={t('pos_quick_add_hint', { defaultValue: 'دوّر على منتج واضغط Enter عشان تضيف أول نتيجة.' })} />
        )}
      </Box>
    </SectionCard>
  );
}

function CartPanel({ t, isRTL, cart, updateQuantity }) {
  return (
    <SectionCard title={t('cart')} subtitle={t('pos_cart_empty')} accent="warning.main">
      <Box sx={{ maxHeight: { xs: '30vh', md: '50vh' }, overflowY: 'auto' }}>
        {cart.length === 0 ? (
          <EmptyState icon={PointOfSaleOutlinedIcon} title={t('pos_cart_empty')} helperText={t('pos_quick_add_hint', { defaultValue: 'ضيف منتجات من البحث عشان تبدأ البيع.' })} />
        ) : (
          <Stack spacing={1}>
            {cart.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">SKU: {item.sku || t('none')}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">{formatCurrency(item.unitPrice)}</Typography>
                  <ButtonGroup size="small" sx={{ direction: isRTL ? 'rtl' : 'ltr', '& .MuiButton-root': { minWidth: 28 } }}>
                    <Button color="warning" onClick={() => updateQuantity(item.id, -1)}>-</Button>
                    <Button disabled>{item.quantity}</Button>
                    <Button color="primary" onClick={() => updateQuantity(item.id, 1)}>+</Button>
                  </ButtonGroup>
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 72, textAlign: 'right' }}>{formatCurrency(item.quantity * item.unitPrice)}</Typography>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Box>
    </SectionCard>
  );
}

function PaymentSummaryPanel(props) {
  const {
    t,
    isRTL,
    cartSubtotal,
    parsedInvoiceTotal,
    invoiceTotal,
    setInvoiceTotal,
    setIsTotalManuallyOverridden,
    paymentValue,
    setPaymentValue,
    paymentMethod,
    setPaymentMethod,
    handleAddPayment,
    handleCompleteSale,
    canCheckout,
    isCompletingSale,
    paidSoFar,
    remaining,
    payments,
    taxTotal,
    discountTotal,
    dockedMobile,
  } = props;

  return (
    <SectionCard title={t('payment')} subtitle={t('remaining_balance')} accent="success.main">
      <Stack spacing={1}>
        <Typography variant="body2">{t('invoice_total')}: {formatCurrency(cartSubtotal)}</Typography>
        <Typography variant="body2">{t('pos_receipt_discount')}: {formatCurrency(discountTotal)}</Typography>
        <Typography variant="body2">{t('pos_receipt_tax')}: {formatCurrency(taxTotal)}</Typography>
        <Typography variant="h6" fontWeight={700}>{t('pos_receipt_totals')}: {formatCurrency(parsedInvoiceTotal)}</Typography>
        <Typography variant="body2">{t('amount_paid')}: {formatCurrency(paidSoFar)}</Typography>
        <Typography variant="body2" color={remaining > 0 ? 'warning.main' : 'success.main'}>{t('remaining_balance')}: {formatCurrency(remaining)}</Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
        <TextField
          label={t('invoice_total')}
          type="number"
          size="small"
          value={invoiceTotal}
          inputProps={{ min: 0, step: '0.01' }}
          onChange={(event) => {
            setIsTotalManuallyOverridden(true);
            setInvoiceTotal(event.target.value);
          }}
          fullWidth
        />
        <Button variant="outlined" color="warning" onClick={() => { setInvoiceTotal(cartSubtotal.toFixed(2)); setIsTotalManuallyOverridden(false); }}>
          {t('pos_reset_to_cart_total', { defaultValue: 'Reset to cart total' })}
        </Button>
      </Stack>

      <TextField
        label={t('payment_amount')}
        type="number"
        size="small"
        value={paymentValue}
        inputProps={{ min: 0, step: '0.01' }}
        onChange={(event) => setPaymentValue(event.target.value)}
        fullWidth
      />
      <ButtonGroup variant="outlined" fullWidth>
        {PAYMENT_METHODS.map((method) => (
          <Button key={method} variant={paymentMethod === method ? 'contained' : 'outlined'} onClick={() => setPaymentMethod(method)}>
            {t(`payment_method_${method}`, { defaultValue: method })}
          </Button>
        ))}
      </ButtonGroup>

      <Button variant="contained" color="primary" onClick={handleAddPayment} fullWidth>
        {t('record_payment')}
      </Button>

      {payments.length === 0 ? (
        <EmptyState icon={PointOfSaleOutlinedIcon} title={t('pos_no_payments', { defaultValue: 'لسه مفيش مدفوعات متسجلة.' })} helperText={t('payment_amount')} />
      ) : (
        <List dense>
          {payments.map((payment, index) => (
            <ListItem key={payment.id} divider>
              <ListItemText
                primary={`${t('payment')} #${index + 1}`}
                secondary={`${t(`payment_method_${payment.method}`, { defaultValue: payment.method })} • ${payment.label} → ${formatCurrency(payment.amount)}`}
                sx={{ textAlign: isRTL ? 'right' : 'left' }}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Button
        variant="contained"
        color="success"
        disabled={!canCheckout || isCompletingSale}
        onClick={handleCompleteSale}
        size={dockedMobile ? 'large' : 'medium'}
        fullWidth
      >
        {isCompletingSale
          ? t('pos_completing_sale', { defaultValue: 'Completing Sale...' })
          : t('pos_complete_sale', { defaultValue: 'Complete Sale' })}
      </Button>
    </SectionCard>
  );
}

function ReceiptHistoryDialog(props) {
  const {
    t,
    receiptsOpen,
    setReceiptsOpen,
    receiptQuickFilter,
    setReceiptQuickFilter,
    receiptsError,
    receiptsLoading,
    filteredReceipts,
    setActiveReceipt,
    onCreateReturnDraft,
  } = props;

  return (
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
          {receiptsLoading && (
            <LoadingState icon={ReceiptLongOutlinedIcon} title={t('pos_receipts_loading')} helperText={t('pos_receipts_quick_filter')} />
          )}

          {!receiptsLoading && filteredReceipts.length === 0 && (
            <EmptyState icon={ReceiptLongOutlinedIcon} title={t('pos_receipts_empty')} helperText={t('pos_receipts_quick_filter_placeholder')} />
          )}

          {filteredReceipts.map((receipt) => (
            <Card key={receipt.id} variant="outlined">
              <CardContent sx={{ p: 1.5 }}>
                <Stack spacing={0.5}>
                  <Typography fontWeight={600}>{t('pos_receipt_number')}: {receipt.invoice_number || receipt.local_invoice_no || t('none')}</Typography>
                  <Typography variant="body2">{t('pos_receipt_datetime')}: {formatDateTime(receipt.created_at)}</Typography>
                  <Typography variant="body2">{t('pos_receipt_totals')}: {formatCurrency(receipt.total)}</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Button size="small" onClick={() => setActiveReceipt(receipt)}>{t('pos_open_receipt_details')}</Button>
                    <Button size="small" variant="contained" color="warning" onClick={() => onCreateReturnDraft(receipt)}>
                      {t('pos_return_items_action', { defaultValue: 'Return items' })}
                    </Button>
                    <Button size="small" variant="outlined" disabled>
                      {t('pos_exchange_items_action', { defaultValue: 'Exchange' })}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function HeldCartsDialog(props) {
  const {
    t,
    heldCartsOpen,
    setHeldCartsOpen,
    heldCartSearch,
    setHeldCartSearch,
    filteredHeldCarts,
    onResumeHeldCart,
    onDeleteHeldCart,
  } = props;

  return (
    <Dialog open={heldCartsOpen} onClose={() => setHeldCartsOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{t('pos_held_carts', { defaultValue: 'Held carts' })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ py: 1 }}>
          <TextField
            size="small"
            label={t('search', { defaultValue: 'Search' })}
            placeholder={t('pos_held_carts_search_placeholder', { defaultValue: 'Search by note, customer, or time' })}
            value={heldCartSearch}
            onChange={(event) => setHeldCartSearch(event.target.value)}
          />

          {filteredHeldCarts.length === 0 ? (
            <EmptyState
              icon={PointOfSaleOutlinedIcon}
              title={t('pos_held_carts_empty', { defaultValue: 'No held carts found' })}
              helperText={t('pos_held_carts_empty_hint', { defaultValue: 'Hold a cart from the POS screen to resume it later.' })}
            />
          ) : (
            filteredHeldCarts.map((heldCart) => (
              <Card key={heldCart.id} variant="outlined">
                <CardContent sx={{ p: 1.5 }}>
                  <Stack spacing={0.5}>
                    <Typography fontWeight={700}>{heldCart.note || t('pos_held_carts_no_note', { defaultValue: 'No note' })}</Typography>
                    <Typography variant="body2">{t('customer')}: {heldCart.customer?.name || t('walk_in_customer', { defaultValue: 'Walk-in customer' })}</Typography>
                    <Typography variant="body2">{t('pos_receipt_totals')}: {formatCurrency(heldCart.total)}</Typography>
                    <Typography variant="body2">{t('pos_receipt_datetime')}: {formatDateTime(heldCart.created_at)}</Typography>
                    <Typography variant="body2">{t('pos_receipt_cashier')}: {heldCart.cashier || t('none')}</Typography>
                    <Typography variant="body2">{t('pos_receipt_line_items')}: {formatNumber((heldCart.items || []).length)}</Typography>
                    <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
                      <Button size="small" variant="contained" onClick={() => onResumeHeldCart(heldCart)}>
                        {t('resume', { defaultValue: 'Resume' })}
                      </Button>
                      <Button size="small" color="error" onClick={() => onDeleteHeldCart(heldCart.id)}>
                        {t('delete', { defaultValue: 'Delete' })}
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default function POS() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { can, user } = useAuth();
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
  const [paymentValue, setPaymentValue] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
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
  const [returnDraftOpen, setReturnDraftOpen] = useState(false);
  const [returnDraftLoading, setReturnDraftLoading] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnDraftError, setReturnDraftError] = useState('');
  const [returnDraftReceipt, setReturnDraftReceipt] = useState(null);
  const [returnDraftLines, setReturnDraftLines] = useState([]);
  const [returnDraftPayments, setReturnDraftPayments] = useState([]);
  const [returnReason, setReturnReason] = useState('');
  const [heldCartNote, setHeldCartNote] = useState('');
  const [heldCartsOpen, setHeldCartsOpen] = useState(false);
  const [heldCarts, setHeldCarts] = useState([]);
  const [heldCartSearch, setHeldCartSearch] = useState('');

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

  useEffect(() => {
    try {
      const rawHeldCarts = localStorage.getItem(HELD_CARTS_STORAGE_KEY);
      if (!rawHeldCarts) return;
      const parsedHeldCarts = JSON.parse(rawHeldCarts);
      if (Array.isArray(parsedHeldCarts)) {
        setHeldCarts(parsedHeldCarts);
      }
    } catch (err) {
      console.error('Failed to read held carts from local storage', err);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HELD_CARTS_STORAGE_KEY, JSON.stringify(heldCarts));
  }, [heldCarts]);

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
    return Math.min(value, remaining);
  }, [paymentValue, remaining]);

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
    }),
    [cart, parsedInvoiceTotal, selectedCustomer],
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

  const filteredHeldCarts = useMemo(() => {
    const query = normalize(heldCartSearch);
    if (!query) {
      return heldCarts;
    }

    return heldCarts.filter((heldCart) => {
      const customerName = normalize(heldCart.customer?.name);
      const customerPhone = normalize(heldCart.customer?.phone);
      const note = normalize(heldCart.note);
      const createdAtIso = normalize(heldCart.created_at);
      const createdAtFormatted = normalize(formatDateTime(heldCart.created_at));
      return [customerName, customerPhone, note, createdAtIso, createdAtFormatted].some((entry) => entry.includes(query));
    });
  }, [heldCartSearch, heldCarts]);

  const computedReturnLines = useMemo(
    () =>
      returnDraftLines
        .filter((line) => Number(line.quantity) > 0)
        .map((line) => {
          const quantity = Number(line.quantity || 0);
          const refundSubtotal = toAmount(quantity * Number(line.unit_refund_subtotal || 0));
          const refundTax = toAmount(quantity * Number(line.unit_refund_tax || 0));
          const refundTotal = toAmount(quantity * Number(line.unit_refund_total || 0));
          return {
            ...line,
            quantity,
            refundSubtotal,
            refundTax,
            refundTotal,
          };
        }),
    [returnDraftLines],
  );

  const returnTotal = useMemo(
    () => toAmount(computedReturnLines.reduce((sum, line) => sum + line.refundTotal, 0)),
    [computedReturnLines],
  );

  const returnRefundPreview = useMemo(() => {
    if (returnTotal <= 0) return [];
    const sortedMethods = [...returnDraftPayments].sort((a, b) => String(a.method || '').localeCompare(String(b.method || '')));
    let remainingAmount = returnTotal;

    return sortedMethods
      .map((entry) => {
        const suggestedAmount = toAmount(Math.min(remainingAmount, Number(entry.paid_amount || 0)));
        remainingAmount = toAmount(remainingAmount - suggestedAmount);
        return {
          method: entry.method,
          paidAmount: Number(entry.paid_amount || 0),
          suggestedAmount,
        };
      })
      .filter((entry) => entry.suggestedAmount > 0);
  }, [returnDraftPayments, returnTotal]);

  const returnRefundTotal = useMemo(
    () => toAmount(returnRefundPreview.reduce((sum, entry) => sum + Number(entry.suggestedAmount || 0), 0)),
    [returnRefundPreview],
  );

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
        method: paymentMethod,
        amount: Number(computedPaymentAmount.toFixed(2)),
        label: formatCurrency(paymentValue || 0),
      },
    ]);
    setPaymentValue('0');
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
      const invoiceResponse = await axios.post('/api/v1/pos/invoices/', invoicePayload);
      const createdInvoice = invoiceResponse.data;
      const paymentContracts = payments.map((paymentEntry) => ({
        invoice: createdInvoice.id,
        method: paymentEntry.method,
        amount: Number(paymentEntry.amount.toFixed(2)),
        device: createdInvoice.device,
        event_id: crypto.randomUUID(),
        paid_at: new Date().toISOString(),
      }));

      await Promise.all(paymentContracts.map((paymentContract) => axios.post('/api/v1/payments/', paymentContract)));

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
      const status = err?.response?.status;
      let message = t('pos_complete_sale_error', { defaultValue: 'Unable to complete sale. Please try again.' });

      if (status === 405) {
        message = t('pos_complete_sale_method_not_allowed', {
          defaultValue: 'POS sale endpoint is not enabled. Contact your supervisor to enable POS invoice creation.',
        });
      } else if (status === 403) {
        message = t('pos_complete_sale_forbidden', {
          defaultValue: 'You are not allowed to create POS invoices. Ask your supervisor/admin for POS create permission.',
        });
      }

      setActionFeedback({
        severity: 'error',
        message,
      });
    } finally {
      setIsCompletingSale(false);
    }
  };

  const handleSelectCustomer = (customer) => {
    setSelectedCustomer(customer);
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

  const handleOpenReturnDraft = async (receipt) => {
    setReturnDraftOpen(true);
    setReturnDraftLoading(true);
    setReturnDraftError('');
    setReturnReason('');
    setReturnDraftReceipt(receipt);
    try {
      const response = await axios.get('/api/v1/returns/preview/', { params: { invoice: receipt.id } });
      const draft = response.data || {};
      const lines = (draft.lines || []).map((line) => ({
        ...line,
        quantity: Number(line.available_quantity || 0),
      }));
      setReturnDraftLines(lines);
      setReturnDraftPayments(draft.payment_methods || []);
    } catch (err) {
      console.error('Failed to prepare return draft', err);
      setReturnDraftError(t('pos_return_prepare_error', { defaultValue: 'Unable to prepare return draft.' }));
    } finally {
      setReturnDraftLoading(false);
    }
  };

  const handleCloseReturnDraft = (force = false) => {
    if (returnSubmitting && !force) {
      return;
    }
    setReturnDraftOpen(false);
    setReturnDraftError('');
    setReturnDraftReceipt(null);
    setReturnDraftLines([]);
    setReturnDraftPayments([]);
    setReturnReason('');
  };

  const handleReturnLineQuantityChange = (invoiceLineId, value) => {
    setReturnDraftLines((prev) =>
      prev.map((line) => {
        if (line.invoice_line !== invoiceLineId) {
          return line;
        }
        return {
          ...line,
          quantity: clampNumber(value, 0, Number(line.available_quantity || 0)),
        };
      }),
    );
  };

  const handleConfirmReturn = async () => {
    if (!returnDraftReceipt || returnSubmitting || computedReturnLines.length === 0) {
      return;
    }

    const refundPayload = returnRefundPreview.map((entry) => ({
      method: entry.method,
      amount: toAmount(entry.suggestedAmount),
    }));

    if (refundPayload.length === 0 || returnRefundTotal !== returnTotal) {
      setReturnDraftError(t('pos_return_no_refund_methods', { defaultValue: 'Unable to fully allocate refund to payment methods.' }));
      return;
    }

    setReturnSubmitting(true);
    setReturnDraftError('');
    try {
      await axios.post('/api/v1/returns/', {
        invoice: returnDraftReceipt.id,
        device: returnDraftReceipt.device,
        event_id: crypto.randomUUID(),
        reason: returnReason.trim() || null,
        lines: computedReturnLines.map((line) => ({
          invoice_line: line.invoice_line,
          quantity: toAmount(line.quantity),
        })),
        refunds: refundPayload,
      });

      setActionFeedback({
        severity: 'success',
        message: t('pos_return_success', { defaultValue: 'Return processed successfully.' }),
      });
      handleCloseReturnDraft(true);
      loadReceipts();
    } catch (err) {
      console.error('Failed to submit return', err);
      setReturnDraftError(
        err?.response?.data?.detail
        || err?.response?.data?.refunds?.[0]
        || t('pos_return_submit_error', { defaultValue: 'Unable to process return.' }),
      );
    } finally {
      setReturnSubmitting(false);
    }
  };

  const handleHoldCurrentCart = () => {
    if (!cart.length) {
      setActionFeedback({
        severity: 'error',
        message: t('pos_hold_cart_empty', { defaultValue: 'Add items before holding a cart.' }),
      });
      return;
    }

    const heldCart = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      cashier: user?.username || user?.id || t('none'),
      note: heldCartNote.trim(),
      customer: selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
          }
        : null,
      items: cart,
      total: Number(parsedInvoiceTotal.toFixed(2)),
      invoiceTotal,
      isTotalManuallyOverridden,
    };

    setHeldCarts((prev) => [heldCart, ...prev]);
    setHeldCartNote('');
    setCart([]);
    setPayments([]);
    setSelectedCustomer(null);
    setPaymentValue('0');
    setInvoiceTotal('0');
    setIsTotalManuallyOverridden(false);
    setSearchQuery('');
    setCustomerQuery('');

    // Optional future enhancement: mirror held cart payload to backend endpoint for multi-device sync.
    setActionFeedback({
      severity: 'success',
      message: t('pos_hold_cart_saved', { defaultValue: 'Cart held successfully.' }),
    });
  };

  const handleResumeHeldCart = (heldCart) => {
    setCart(Array.isArray(heldCart.items) ? heldCart.items : []);
    setSelectedCustomer(heldCart.customer || null);
    setInvoiceTotal(String(heldCart.invoiceTotal ?? heldCart.total ?? 0));
    setIsTotalManuallyOverridden(Boolean(heldCart.isTotalManuallyOverridden));
    setPayments([]);
    setPaymentValue('0');
    setHeldCarts((prev) => prev.filter((entry) => entry.id !== heldCart.id));
    setHeldCartsOpen(false);
    setActionFeedback({
      severity: 'success',
      message: t('pos_hold_cart_resumed', { defaultValue: 'Held cart resumed.' }),
    });
  };

  const handleDeleteHeldCart = (heldCartId) => {
    setHeldCarts((prev) => prev.filter((entry) => entry.id !== heldCartId));
  };

  const canCheckout = cart.length > 0 && remaining === 0 && payments.length > 0;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const taxTotal = 0;
  const discountTotal = Math.max(cartSubtotal - parsedInvoiceTotal + taxTotal, 0);

  return (
    <PageShell>
      <Stack spacing={2.5} sx={{ pb: { xs: 14, md: 0 } }}>
        <PageHeader title={t('pos')} subtitle={t('pos_intro_text')} />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="outlined" onClick={openReceiptsPanel}>
            {t('pos_receipts_open')}
          </Button>
          <Button variant="outlined" onClick={() => setHeldCartsOpen(true)}>
            {t('pos_held_carts_open', { defaultValue: 'Held carts' })} ({heldCarts.length})
          </Button>
          {can('inventory.view') && (
            <Button variant="outlined" onClick={() => navigate('/suppliers')}>
              {t('pos_open_suppliers')}
            </Button>
          )}
        </Stack>

        {!!error && <ErrorState title={t('pos_load_products_error', { defaultValue: 'في مشكلة في تحميل البيانات' })} helperText={error} actionLabel={t('retry', { defaultValue: 'جرّب تاني' })} onAction={() => window.location.reload()} />}
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
              title={t('pos_hold_cart_title', { defaultValue: 'Hold current cart' })}
              subtitle={t('pos_hold_cart_subtitle', { defaultValue: 'Save this cart to resume it later on this device.' })}
              accent="info.main"
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  label={t('note', { defaultValue: 'Note' })}
                  placeholder={t('pos_held_cart_note_placeholder', { defaultValue: 'Optional note (table, order name, etc.)' })}
                  value={heldCartNote}
                  onChange={(event) => setHeldCartNote(event.target.value)}
                  fullWidth
                />
                <Button variant="contained" onClick={handleHoldCurrentCart}>
                  {t('pos_hold_cart_action', { defaultValue: 'Hold cart' })}
                </Button>
              </Stack>
            </SectionCard>

            <ProductSearchPanel
              t={t}
              isRTL={isRTL}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              flatResults={flatResults}
              activeResultIndex={activeResultIndex}
              setActiveResultIndex={setActiveResultIndex}
              activateResult={activateResult}
              activeCategoryId={activeCategoryId}
              categoriesById={categoriesById}
              clearCategoryFilter={clearCategoryFilter}
              productsLoading={productsLoading}
              searchGroups={searchGroups}
              addToCart={addToCart}
              handleSelectCategory={handleSelectCategory}
              handleSelectCustomer={handleSelectCustomer}
            />

            <CartPanel t={t} isRTL={isRTL} cart={cart} updateQuantity={updateQuantity} />
          </Stack>

          <Stack
            spacing={2}
            sx={{
              position: { xs: 'fixed', md: 'sticky' },
              bottom: { xs: 0, md: 'auto' },
              top: { md: 16 },
              left: { xs: 0, md: 'auto' },
              right: { xs: 0, md: 'auto' },
              zIndex: 10,
              bgcolor: { xs: 'background.paper', md: 'transparent' },
              p: { xs: 1.25, md: 0 },
              borderTop: { xs: '1px solid', md: 'none' },
              borderColor: 'divider',
            }}
          >
            <PaymentSummaryPanel
              t={t}
              isRTL={isRTL}
              cartSubtotal={cartSubtotal}
              parsedInvoiceTotal={parsedInvoiceTotal}
              invoiceTotal={invoiceTotal}
              setInvoiceTotal={setInvoiceTotal}
              setIsTotalManuallyOverridden={setIsTotalManuallyOverridden}
              paymentValue={paymentValue}
              setPaymentValue={setPaymentValue}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              handleAddPayment={handleAddPayment}
              handleCompleteSale={handleCompleteSale}
              canCheckout={canCheckout}
              isCompletingSale={isCompletingSale}
              paidSoFar={paidSoFar}
              remaining={remaining}
              payments={payments}
              taxTotal={taxTotal}
              discountTotal={discountTotal}
              dockedMobile={isMobile}
            />
          </Stack>
        </Box>
      </Stack>

      <ReceiptHistoryDialog
        t={t}
        receiptsOpen={receiptsOpen}
        setReceiptsOpen={setReceiptsOpen}
        receiptQuickFilter={receiptQuickFilter}
        setReceiptQuickFilter={setReceiptQuickFilter}
        receiptsError={receiptsError}
        receiptsLoading={receiptsLoading}
        filteredReceipts={filteredReceipts}
        setActiveReceipt={setActiveReceipt}
        onCreateReturnDraft={handleOpenReturnDraft}
      />

      <HeldCartsDialog
        t={t}
        heldCartsOpen={heldCartsOpen}
        setHeldCartsOpen={setHeldCartsOpen}
        heldCartSearch={heldCartSearch}
        setHeldCartSearch={setHeldCartSearch}
        filteredHeldCarts={filteredHeldCarts}
        onResumeHeldCart={handleResumeHeldCart}
        onDeleteHeldCart={handleDeleteHeldCart}
      />

      <Dialog open={returnDraftOpen} onClose={handleCloseReturnDraft} fullWidth maxWidth="md">
        <DialogTitle>{t('pos_return_items_action', { defaultValue: 'Return items' })}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ py: 1 }}>
            {returnDraftError && <Alert severity="error">{returnDraftError}</Alert>}
            {returnDraftLoading ? (
              <LoadingState icon={ReceiptLongOutlinedIcon} title={t('pos_receipts_loading')} helperText={t('pos_return_items_action', { defaultValue: 'Preparing return draft...' })} />
            ) : (
              <>
                <Typography variant="body2">
                  {t('pos_receipt_number')}: {returnDraftReceipt?.invoice_number || returnDraftReceipt?.local_invoice_no || t('none')}
                </Typography>
                <TextField
                  size="small"
                  label={t('reason', { defaultValue: 'Reason' })}
                  placeholder={t('pos_return_reason_placeholder', { defaultValue: 'Optional reason for return' })}
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  fullWidth
                />
                <Divider />
                <Typography fontWeight={600}>{t('pos_receipt_line_items')}</Typography>
                {returnDraftLines.map((line) => (
                  <Card key={line.invoice_line} variant="outlined">
                    <CardContent sx={{ p: 1.25 }}>
                      <Stack spacing={1}>
                        <Typography variant="body2" fontWeight={600}>{line.product_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t('pos_return_available_qty', { defaultValue: 'Sold: {{sold}} • Previously returned: {{returned}} • Available: {{available}}', sold: formatNumber(line.sold_quantity), returned: formatNumber(line.returned_quantity), available: formatNumber(line.available_quantity) })}
                        </Typography>
                        <TextField
                          size="small"
                          type="number"
                          label={t('quantity')}
                          value={line.quantity}
                          inputProps={{ min: 0, max: Number(line.available_quantity || 0), step: '0.01' }}
                          onChange={(event) => handleReturnLineQuantityChange(line.invoice_line, event.target.value)}
                        />
                        <FormHelperText>
                          {t('pos_return_line_refund_hint', { defaultValue: 'Per unit refund: {{amount}}', amount: formatCurrency(line.unit_refund_total || 0) })}
                        </FormHelperText>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                <Divider />
                <Typography fontWeight={700}>{t('pos_return_total_preview', { defaultValue: 'Return total preview' })}: {formatCurrency(returnTotal)}</Typography>
                {returnRefundTotal !== returnTotal && returnTotal > 0 && (
                  <Alert severity="warning">
                    {t('pos_return_refund_limit_warning', { defaultValue: 'Refund exceeds paid amount split. Reduce quantities to continue.' })}
                  </Alert>
                )}
                <Typography fontWeight={600}>{t('pos_receipt_payment_methods')}</Typography>
                {returnRefundPreview.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{t('none')}</Typography>
                ) : (
                  <List dense>
                    {returnRefundPreview.map((refund) => (
                      <ListItem key={refund.method} divider>
                        <ListItemText
                          primary={`${t(`payment_method_${refund.method}`, { defaultValue: refund.method })} → ${formatCurrency(refund.suggestedAmount)}`}
                          secondary={t('pos_return_payment_refund_hint', { defaultValue: 'Paid via method: {{amount}}', amount: formatCurrency(refund.paidAmount) })}
                          sx={{ textAlign: isRTL ? 'right' : 'left' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" onClick={handleCloseReturnDraft} disabled={returnSubmitting}>
                    {t('cancel')}
                  </Button>
                  <Button
                    variant="contained"
                    color="warning"
                    disabled={returnSubmitting || computedReturnLines.length === 0 || returnTotal <= 0 || returnRefundTotal !== returnTotal}
                    onClick={handleConfirmReturn}
                  >
                    {returnSubmitting
                      ? t('saving', { defaultValue: 'Saving...' })
                      : t('pos_return_confirm_partial', { defaultValue: 'Confirm return (supports partial)' })}
                  </Button>
                </Stack>
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(activeReceipt)} onClose={() => setActiveReceipt(null)} fullWidth maxWidth="md">
        <DialogTitle>{t('pos_receipt_details')}</DialogTitle>
        <DialogContent>
          {activeReceipt && (
            <Stack spacing={1.2} sx={{ py: 1 }}>
              <Typography>{t('pos_receipt_number')}: {activeReceipt.invoice_number || activeReceipt.local_invoice_no || t('none')}</Typography>
              <Typography>{t('pos_receipt_datetime')}: {formatDateTime(activeReceipt.created_at)}</Typography>
              <Typography>{t('pos_receipt_cashier')}: {activeReceipt.user || t('none')}</Typography>
              <Typography>{t('pos_receipt_customer')}: {activeReceipt.customer?.name || t('unnamed_customer')}</Typography>
              <Typography>{t('phone')}: {activeReceipt.customer?.phone || t('no_phone')}</Typography>
              <Divider />
              <Typography fontWeight={600}>{t('pos_receipt_line_items')}</Typography>
              {(activeReceipt.lines || []).length > 0 ? (
                activeReceipt.lines.map((line) => (
                  <Typography key={line.id} variant="body2">
                    #{formatNumber(line.product)} • {formatNumber(line.quantity)} × {formatCurrency(line.unit_price)} • {t('pos_receipt_discount')} {formatCurrency(line.discount)} • {t('pos_receipt_tax')} {formatNumber(Number(line.tax_rate || 0) * 100)}% • {t('pos_receipt_totals')} {formatCurrency(line.line_total)}
                  </Typography>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">{t('none')}</Typography>
              )}
              <Divider />
              <Typography>{t('pos_receipt_totals')}: {formatCurrency(activeReceipt.total)}</Typography>
              <Typography>{t('pos_receipt_discount')}: {formatCurrency(activeReceipt.discount_total)}</Typography>
              <Typography>{t('pos_receipt_tax')}: {formatCurrency(activeReceipt.tax_total)}</Typography>
              <Typography>{t('amount_paid')}: {formatCurrency(activeReceipt.amount_paid)}</Typography>
              <Typography>{t('pos_receipt_balance')}: {formatCurrency(activeReceipt.balance_due)}</Typography>
              <Typography>
                {t('pos_receipt_payment_methods')}: {(activeReceipt.payments || []).map((paymentEntry) => `${paymentEntry.method} (${formatCurrency(paymentEntry.amount)})`).join(', ') || t('none')}
              </Typography>
              <Typography>{t('pos_receipt_returns')}: {formatNumber((activeReceipt.returns || []).length)}</Typography>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
