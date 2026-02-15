import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
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
import { useSync } from '../sync/SyncContext';

const emptyLine = { product: '', quantity: '1.00' };

const initialProductForm = {
  id: '',
  category: '',
  sku: '',
  barcode: '',
  name: '',
  description: '',
  brand: '',
  unit: 'pcs',
  slug: '',
  price: '0.00',
  cost: '',
  tax_rate: '0.0000',
  minimum_quantity: '0.00',
  reorder_quantity: '0.00',
  preferred_supplier: '',
  stock_status: '',
  is_sellable_online: false,
  is_active: true,
  image: null,
};

export default function Inventory() {
  const { t } = useTranslation();
  const { enqueueEvent, pushNow, pullNow } = useSync();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierAging, setSupplierAging] = useState([]);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ supplier_id: '', amount: '0.00', method: 'bank_transfer', paid_at: new Date().toISOString().slice(0, 16), reference: '', notes: '' });
  const [stockIntel, setStockIntel] = useState({ rows: [], low_count: 0, critical_count: 0 });
  const [alerts, setAlerts] = useState([]);
  const [poPreview, setPoPreview] = useState(null);
  const [poFilters, setPoFilters] = useState({ branch_id: '', warehouse_id: '', severity: '', min_stockout_days: '' });
  const [isCreatingPO, setIsCreatingPO] = useState(false);
  const [draftStatus, setDraftStatus] = useState({});
  const [error, setError] = useState('');
  const [productForm, setProductForm] = useState(initialProductForm);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [transferForm, setTransferForm] = useState({
    source_warehouse_id: '',
    destination_warehouse_id: '',
    reference: '',
    requires_supervisor_approval: false,
    notes: '',
    lines: [emptyLine],
  });

  const loadData = async () => {
    try {
      const [productsRes, categoriesRes, warehousesRes, transferRes, stockRes, unreadAlertsRes, suppliersRes, agingRes] = await Promise.all([
        axios.get('/api/v1/products/'),
        axios.get('/api/v1/categories/'),
        axios.get('/api/v1/warehouses/'),
        axios.get('/api/v1/stock-transfers/'),
        axios.get('/api/v1/stock-intelligence/'),
        axios.get('/api/v1/alerts/unread/'),
        axios.get('/api/v1/suppliers/'),
        axios.get('/api/v1/reports/supplier-aging/'),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data || []);
      setWarehouses(warehousesRes.data);
      setTransfers(transferRes.data);
      setStockIntel(stockRes.data || { rows: [] });
      setAlerts(unreadAlertsRes.data || []);
      setSuppliers(suppliersRes.data || []);
      setSupplierAging(agingRes.data || []);
      setDraftStatus(
        productsRes.data.reduce((acc, p) => {
          acc[p.id] = p.stock_status || '';
          return acc;
        }, {}),
      );
      setError('');
    } catch (err) {
      console.error('Failed to load inventory data', err);
      setError(t('inventory_load_error'));
    }
  };

  useEffect(() => {
    loadData();
  }, [t]);

  const saveStatus = async (product) => {
    try {
      enqueueEvent({
        eventType: 'product.stock_status.set',
        payload: {
          product_id: product.id,
          stock_status: draftStatus[product.id] || '',
        },
      });
      await pushNow();
      await pullNow();
      await loadData();
    } catch (err) {
      console.error('Failed to save status', err);
      setError(t('inventory_save_stock_status_error'));
    }
  };

  const markAlertsRead = async () => {
    if (!alerts.length) return;
    try {
      await axios.post('/api/v1/alerts/mark-read/', { alert_ids: alerts.map((a) => a.id) });
      await loadData();
    } catch (err) {
      console.error('Failed to mark alerts read', err);
      setError(t('inventory_mark_alerts_read_error'));
    }
  };

  const createPOFromSuggestions = async () => {
    setIsCreatingPO(true);
    try {
      const payload = {
        branch_id: poFilters.branch_id || undefined,
        warehouse_id: poFilters.warehouse_id || undefined,
        severity: poFilters.severity || undefined,
        min_stockout_days: poFilters.min_stockout_days === '' ? undefined : Number(poFilters.min_stockout_days),
      };
      const response = await axios.post('/api/v1/reorder-suggestions/create-po/', payload);
      setPoPreview(response.data);
      await loadData();
    } catch (err) {
      console.error('Failed to create purchase order from suggestions', err);
      setError(t('inventory_create_po_from_suggestions_error', 'Failed to create PO from suggestions.'));
    } finally {
      setIsCreatingPO(false);
    }
  };

  const canCreateTransfer = useMemo(
    () => transferForm.source_warehouse_id && transferForm.destination_warehouse_id && transferForm.reference,
    [transferForm],
  );

  const createTransfer = async () => {
    try {
      enqueueEvent({
        eventType: 'stock.transfer.create',
        payload: {
          source_warehouse_id: transferForm.source_warehouse_id,
          destination_warehouse_id: transferForm.destination_warehouse_id,
          reference: transferForm.reference,
          requires_supervisor_approval: transferForm.requires_supervisor_approval,
          notes: transferForm.notes,
          lines: transferForm.lines
            .filter((line) => line.product)
            .map((line) => ({ product_id: line.product, quantity: line.quantity })),
        },
      });
      await pushNow();
      await pullNow();
      setTransferForm({
        source_warehouse_id: '',
        destination_warehouse_id: '',
        reference: '',
        requires_supervisor_approval: false,
        notes: '',
        lines: [emptyLine],
      });
      await loadData();
    } catch (err) {
      console.error('Failed to create transfer', err);
      setError(t('inventory_create_transfer_error'));
    }
  };

  const startEditProduct = (product) => {
    setProductForm({
      id: product.id,
      category: product.category || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      name: product.name || '',
      description: product.description || '',
      brand: product.brand || '',
      unit: product.unit || 'pcs',
      slug: product.slug || '',
      price: product.price || '0.00',
      cost: product.cost || '',
      tax_rate: product.tax_rate || '0.0000',
      minimum_quantity: product.minimum_quantity || '0.00',
      reorder_quantity: product.reorder_quantity || '0.00',
      preferred_supplier: product.preferred_supplier || '',
      stock_status: product.stock_status || '',
      is_sellable_online: !!product.is_sellable_online,
      is_active: product.is_active !== false,
      image: null,
    });
  };

  const clearProductForm = () => setProductForm(initialProductForm);

  const saveProduct = async () => {
    setIsSavingProduct(true);
    try {
      const payload = new FormData();
      [
        'category', 'sku', 'barcode', 'name', 'description', 'brand', 'unit', 'slug', 'price', 'cost',
        'tax_rate', 'minimum_quantity', 'reorder_quantity', 'preferred_supplier', 'stock_status',
      ].forEach((key) => {
        const value = productForm[key];
        if (value !== null && value !== undefined) {
          payload.append(key, value);
        }
      });
      payload.append('is_sellable_online', productForm.is_sellable_online ? 'true' : 'false');
      payload.append('is_active', productForm.is_active ? 'true' : 'false');
      if (productForm.image instanceof File) {
        payload.append('image', productForm.image);
      }

      if (productForm.id) {
        await axios.patch(`/api/v1/admin/products/${productForm.id}/`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await axios.post('/api/v1/admin/products/', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      clearProductForm();
      await loadData();
    } catch (err) {
      console.error('Failed to save product', err);
      setError(t('inventory_save_product_error', 'Failed to save product details.'));
    } finally {
      setIsSavingProduct(false);
    }
  };

  const approveTransfer = async (transferId) => {
    try {
      enqueueEvent({ eventType: 'stock.transfer.approve', payload: { transfer_id: transferId } });
      await pushNow();
      await pullNow();
      await loadData();
    } catch (err) {
      console.error('Failed to approve transfer', err);
      setError(t('inventory_approve_transfer_error'));
    }
  };

  const completeTransfer = async (transferId) => {
    try {
      enqueueEvent({ eventType: 'stock.transfer.complete', payload: { transfer_id: transferId } });
      await pushNow();
      await pullNow();
      await loadData();
    } catch (err) {
      console.error('Failed to complete transfer', err);
      setError(t('inventory_complete_transfer_error'));
    }
  };

  const submitSupplierPayment = async () => {
    if (!paymentForm.supplier_id) return;
    setIsSavingPayment(true);
    try {
      await axios.post(`/api/v1/suppliers/${paymentForm.supplier_id}/payments/`, {
        amount: paymentForm.amount,
        method: paymentForm.method,
        paid_at: new Date(paymentForm.paid_at).toISOString(),
        reference: paymentForm.reference,
        notes: paymentForm.notes,
      });
      setPaymentForm((prev) => ({ ...prev, amount: '0.00', reference: '', notes: '' }));
      await loadData();
    } catch (err) {
      console.error('Failed to save supplier payment', err);
      setError(t('inventory_supplier_payment_error', 'Failed to save supplier payment.'));
    } finally {
      setIsSavingPayment(false);
    }
  };

  const exportSupplierAging = () => {
    const header = ['Supplier', 'Total Purchased', 'Amount Paid', 'Balance Due', 'Current', '30 Days', '60 Days', '90+ Days'];
    const rows = supplierAging.map((row) => [
      row.supplier_name,
      row.total_purchased,
      row.amount_paid,
      row.balance_due,
      row.aging?.current || 0,
      row.aging?.['30'] || 0,
      row.aging?.['60'] || 0,
      row.aging?.['90_plus'] || 0,
    ]);
    const csv = [header, ...rows].map((line) => line.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'supplier-aging.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('inventory')}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('product_details', 'Product details')}</Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label={t('name')} value={productForm.name} onChange={(e) => setProductForm((prev) => ({ ...prev, name: e.target.value }))} fullWidth />
            <TextField label={t('sku')} value={productForm.sku} onChange={(e) => setProductForm((prev) => ({ ...prev, sku: e.target.value }))} fullWidth />
            <TextField label={t('barcode')} value={productForm.barcode} onChange={(e) => setProductForm((prev) => ({ ...prev, barcode: e.target.value }))} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label={t('category')} value={productForm.category} onChange={(e) => setProductForm((prev) => ({ ...prev, category: e.target.value }))} fullWidth>
              <MenuItem value="">{t('none')}</MenuItem>
              {categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
            </TextField>
            <TextField label={t('brand', 'Brand')} value={productForm.brand} onChange={(e) => setProductForm((prev) => ({ ...prev, brand: e.target.value }))} fullWidth />
            <TextField label={t('unit', 'Unit')} value={productForm.unit} onChange={(e) => setProductForm((prev) => ({ ...prev, unit: e.target.value }))} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label={t('price')} value={productForm.price} onChange={(e) => setProductForm((prev) => ({ ...prev, price: e.target.value }))} fullWidth />
            <TextField label={t('cost')} value={productForm.cost} onChange={(e) => setProductForm((prev) => ({ ...prev, cost: e.target.value }))} fullWidth />
            <TextField label={t('tax_rate')} value={productForm.tax_rate} onChange={(e) => setProductForm((prev) => ({ ...prev, tax_rate: e.target.value }))} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label={t('minimum_quantity')} value={productForm.minimum_quantity} onChange={(e) => setProductForm((prev) => ({ ...prev, minimum_quantity: e.target.value }))} fullWidth />
            <TextField label={t('reorder_quantity')} value={productForm.reorder_quantity} onChange={(e) => setProductForm((prev) => ({ ...prev, reorder_quantity: e.target.value }))} fullWidth />
            <TextField label={t('slug', 'Slug')} value={productForm.slug} onChange={(e) => setProductForm((prev) => ({ ...prev, slug: e.target.value }))} fullWidth />
          </Stack>
          <TextField label={t('description')} value={productForm.description} onChange={(e) => setProductForm((prev) => ({ ...prev, description: e.target.value }))} fullWidth multiline minRows={2} />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <Button variant="outlined" component="label">
              {t('upload_image', 'Upload image')}
              <input hidden type="file" accept="image/*" onChange={(e) => setProductForm((prev) => ({ ...prev, image: e.target.files?.[0] || null }))} />
            </Button>
            <Typography color="text.secondary">{productForm.image?.name || t('no_file_selected', 'No file selected')}</Typography>
          </Stack>
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={<Switch checked={productForm.is_sellable_online} onChange={(e) => setProductForm((prev) => ({ ...prev, is_sellable_online: e.target.checked }))} />}
              label={t('is_sellable_online', 'Sellable online')}
            />
            <FormControlLabel
              control={<Switch checked={productForm.is_active} onChange={(e) => setProductForm((prev) => ({ ...prev, is_active: e.target.checked }))} />}
              label={t('active')}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={saveProduct} disabled={isSavingProduct || !productForm.name || !productForm.sku}>
              {productForm.id ? t('save') : t('create')}
            </Button>
            <Button variant="outlined" onClick={clearProductForm}>{t('clear')}</Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">{t('inventory_low_critical_stock')}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip color="error" label={`${t('inventory_critical_label')}: ${stockIntel.critical_count || 0}`} />
            <Chip color="warning" label={`${t('inventory_low_label')}: ${stockIntel.low_count || 0}`} />
            <Button size="small" variant="outlined" href="/api/v1/reorder-suggestions/export/?format=csv">{t('export_csv')}</Button>
            <Button size="small" variant="outlined" href="/api/v1/reorder-suggestions/export/?format=pdf">{t('export_pdf')}</Button>
            <TextField
              size="small"
              label={t('warehouse')}
              select
              value={poFilters.warehouse_id}
              onChange={(e) => setPoFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">{t('all', 'All')}</MenuItem>
              {warehouses.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</MenuItem>)}
            </TextField>
            <TextField
              size="small"
              label={t('severity')}
              select
              value={poFilters.severity}
              onChange={(e) => setPoFilters((prev) => ({ ...prev, severity: e.target.value }))}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="">{t('all', 'All')}</MenuItem>
              <MenuItem value="low">low</MenuItem>
              <MenuItem value="critical">critical</MenuItem>
            </TextField>
            <TextField
              size="small"
              label={t('min_stockout_days', 'Min stockout days')}
              type="number"
              value={poFilters.min_stockout_days}
              onChange={(e) => setPoFilters((prev) => ({ ...prev, min_stockout_days: e.target.value }))}
              sx={{ width: 170 }}
            />
            <Button size="small" variant="contained" onClick={createPOFromSuggestions} disabled={isCreatingPO}>
              {t('create_po_from_alerts', 'Create PO from alerts')}
            </Button>
          </Stack>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('warehouse')}</TableCell>
                <TableCell>{t('product')}</TableCell>
                <TableCell>{t('supplier')}</TableCell>
                <TableCell>{t('on_hand')}</TableCell>
                <TableCell>{t('minimum')}</TableCell>
                <TableCell>{t('reorder')}</TableCell>
                <TableCell>{t('severity')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(stockIntel.rows || []).map((row) => (
                <TableRow key={`${row.warehouse_id}-${row.product_id}`}>
                  <TableCell>{row.warehouse_name}</TableCell>
                  <TableCell>{row.product_name}</TableCell>
                  <TableCell>{row.preferred_supplier_name || t('none')}</TableCell>
                  <TableCell>{row.on_hand}</TableCell>
                  <TableCell>{row.minimum_quantity}</TableCell>
                  <TableCell>{row.suggested_reorder_quantity}</TableCell>
                  <TableCell>
                    <Chip size="small" color={row.severity === 'critical' ? 'error' : 'warning'} label={row.severity} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {poPreview && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('po_creation_result', 'PO creation result')}: {poPreview.created_count || 0} created, {poPreview.skipped_count || 0} skipped
            </Typography>
            {(poPreview.created_purchase_orders || []).map((po) => (
              <Alert key={po.purchase_order_id} severity="success" sx={{ mb: 1 }}>
                {po.po_number} - {po.lines.map((line) => `${line.product_name} (${line.quantity})`).join(', ')}
              </Alert>
            ))}
            {(poPreview.skipped_groups || []).map((group) => (
              <Alert key={group.grouping_token} severity="info" sx={{ mb: 1 }}>
                {t('po_skipped_existing', 'Skipped existing group')}: {group.existing_po_id}
              </Alert>
            ))}
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">{t('inventory_unread_alerts')}</Typography>
          <Button size="small" variant="contained" disabled={!alerts.length} onClick={markAlertsRead}>{t('inventory_mark_all_read')}</Button>
        </Stack>
        {(alerts || []).map((alert) => (
          <Alert key={alert.id} severity={alert.severity === 'critical' ? 'error' : 'warning'} sx={{ mb: 1 }}>
            {t('inventory_alert_message', {
              product: alert.product_name,
              warehouse: alert.warehouse_name,
              current: alert.current_quantity,
              threshold: alert.threshold_quantity,
            })}
          </Alert>
        ))}
        {!alerts.length && <Typography color="text.secondary">{t('inventory_no_unread_alerts')}</Typography>}
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('inventory_product_stock_status')}</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('image', 'Image')}</TableCell>
                <TableCell>{t('name')}</TableCell>
                <TableCell>{t('sku')}</TableCell>
                <TableCell>{t('price')}</TableCell>
                <TableCell>{t('stock_status')}</TableCell>
                <TableCell align="right">{t('actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <Avatar variant="rounded" src={product.image_url || ''} alt={product.name} sx={{ width: 40, height: 40 }} />
                  </TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.sku}</TableCell>
                  <TableCell>${Number(product.price).toFixed(2)}</TableCell>
                  <TableCell width="35%">
                    <TextField
                      fullWidth
                      size="small"
                      value={draftStatus[product.id] || ''}
                      onChange={(e) => setDraftStatus((prev) => ({ ...prev, [product.id]: e.target.value }))}
                      placeholder={t('inventory_stock_status_placeholder')}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button variant="outlined" size="small" onClick={() => startEditProduct(product)}>
                        {t('edit')}
                      </Button>
                      <Button variant="contained" size="small" onClick={() => saveStatus(product)}>
                        {t('save')}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>


      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">{t('supplier_ledger', 'Supplier ledger')}</Typography>
          <Button size="small" variant="outlined" onClick={exportSupplierAging}>{t('export_csv')}</Button>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            select
            label={t('supplier')}
            value={paymentForm.supplier_id}
            onChange={(e) => setPaymentForm((prev) => ({ ...prev, supplier_id: e.target.value }))}
            fullWidth
          >
            <MenuItem value="">{t('select_supplier', 'Select supplier')}</MenuItem>
            {suppliers.map((supplier) => <MenuItem key={supplier.id} value={supplier.id}>{supplier.name}</MenuItem>)}
          </TextField>
          <TextField label={t('amount_paid', 'Amount paid')} value={paymentForm.amount} onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} fullWidth />
          <TextField select label={t('method', 'Method')} value={paymentForm.method} onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))} fullWidth>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="bank_transfer">Bank transfer</MenuItem>
            <MenuItem value="card">Card</MenuItem>
            <MenuItem value="cheque">Cheque</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField>
          <TextField type="datetime-local" label={t('paid_at', 'Paid at')} value={paymentForm.paid_at} onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_at: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
          <Button variant="contained" disabled={isSavingPayment || !paymentForm.supplier_id} onClick={submitSupplierPayment}>{t('save')}</Button>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('supplier')}</TableCell>
                <TableCell>{t('total', 'Total')}</TableCell>
                <TableCell>{t('amount_paid', 'Amount paid')}</TableCell>
                <TableCell>{t('balance_due', 'Balance due')}</TableCell>
                <TableCell>{t('current', 'Current')}</TableCell>
                <TableCell>{t('days_30', '30 days')}</TableCell>
                <TableCell>{t('days_60', '60 days')}</TableCell>
                <TableCell>{t('days_90', '90+ days')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {supplierAging.map((row) => (
                <TableRow key={row.supplier_id}>
                  <TableCell>{row.supplier_name}</TableCell>
                  <TableCell>{row.total_purchased}</TableCell>
                  <TableCell>{row.amount_paid}</TableCell>
                  <TableCell>{row.balance_due}</TableCell>
                  <TableCell>{row.aging?.current || 0}</TableCell>
                  <TableCell>{row.aging?.['30'] || 0}</TableCell>
                  <TableCell>{row.aging?.['60'] || 0}</TableCell>
                  <TableCell>{row.aging?.['90_plus'] || 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('inventory_create_stock_transfer')}</Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label={t('inventory_source_warehouse')} value={transferForm.source_warehouse_id} onChange={(e) => setTransferForm((prev) => ({ ...prev, source_warehouse_id: e.target.value }))} fullWidth>
              {warehouses.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</MenuItem>)}
            </TextField>
            <TextField select label={t('inventory_destination_warehouse')} value={transferForm.destination_warehouse_id} onChange={(e) => setTransferForm((prev) => ({ ...prev, destination_warehouse_id: e.target.value }))} fullWidth>
              {warehouses.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label={t('reference')} value={transferForm.reference} onChange={(e) => setTransferForm((prev) => ({ ...prev, reference: e.target.value }))} fullWidth />
            <TextField label={t('notes')} value={transferForm.notes} onChange={(e) => setTransferForm((prev) => ({ ...prev, notes: e.target.value }))} fullWidth />
          </Stack>
          <FormControlLabel
            control={<Switch checked={transferForm.requires_supervisor_approval} onChange={(e) => setTransferForm((prev) => ({ ...prev, requires_supervisor_approval: e.target.checked }))} />}
            label={t('inventory_requires_supervisor_approval')}
          />
          {transferForm.lines.map((line, index) => (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} key={`line-${index}`}>
              <TextField select label={t('product')} value={line.product} onChange={(e) => setTransferForm((prev) => ({ ...prev, lines: prev.lines.map((entry, i) => (i === index ? { ...entry, product: e.target.value } : entry)) }))} fullWidth>
                {products.map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
              </TextField>
              <TextField label={t('quantity')} value={line.quantity} onChange={(e) => setTransferForm((prev) => ({ ...prev, lines: prev.lines.map((entry, i) => (i === index ? { ...entry, quantity: e.target.value } : entry)) }))} fullWidth />
            </Stack>
          ))}
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={() => setTransferForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine] }))}>{t('inventory_add_line')}</Button>
            <Button variant="contained" disabled={!canCreateTransfer} onClick={createTransfer}>{t('inventory_create_transfer')}</Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('inventory_stock_transfers')}</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('reference')}</TableCell>
                <TableCell>{t('source')}</TableCell>
                <TableCell>{t('destination')}</TableCell>
                <TableCell>{t('status')}</TableCell>
                <TableCell>{t('lines')}</TableCell>
                <TableCell align="right">{t('actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell>{transfer.reference}</TableCell>
                  <TableCell>{warehouses.find((w) => w.id === transfer.source_warehouse)?.name || t('none')}</TableCell>
                  <TableCell>{warehouses.find((w) => w.id === transfer.destination_warehouse)?.name || t('none')}</TableCell>
                  <TableCell><Chip label={transfer.status} size="small" /></TableCell>
                  <TableCell>{(transfer.lines || []).map((line) => `${line.product_name || line.product} (${line.quantity})`).join(', ')}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      {transfer.status === 'draft' && <Button size="small" variant="outlined" onClick={() => approveTransfer(transfer.id)}>{t('approve')}</Button>}
                      {transfer.status === 'approved' && <Button size="small" variant="contained" onClick={() => completeTransfer(transfer.id)}>{t('complete')}</Button>}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}
