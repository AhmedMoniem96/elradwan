import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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

export default function Inventory() {
  const { t } = useTranslation();
  const { enqueueEvent, pushNow, pullNow } = useSync();
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [stockIntel, setStockIntel] = useState({ rows: [], low_count: 0, critical_count: 0 });
  const [alerts, setAlerts] = useState([]);
  const [draftStatus, setDraftStatus] = useState({});
  const [error, setError] = useState('');
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
      const [productsRes, warehousesRes, transferRes, stockRes, unreadAlertsRes] = await Promise.all([
        axios.get('/api/v1/products/'),
        axios.get('/api/v1/warehouses/'),
        axios.get('/api/v1/stock-transfers/'),
        axios.get('/api/v1/stock-intelligence/'),
        axios.get('/api/v1/alerts/unread/'),
      ]);
      setProducts(productsRes.data);
      setWarehouses(warehousesRes.data);
      setTransfers(transferRes.data);
      setStockIntel(stockRes.data || { rows: [] });
      setAlerts(unreadAlertsRes.data || []);
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

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('inventory')}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">{t('inventory_low_critical_stock')}</Typography>
          <Stack direction="row" spacing={1}>
            <Chip color="error" label={`${t('inventory_critical_label')}: ${stockIntel.critical_count || 0}`} />
            <Chip color="warning" label={`${t('inventory_low_label')}: ${stockIntel.low_count || 0}`} />
            <Button size="small" variant="outlined" href="/api/v1/reorder-suggestions/export/?format=csv">{t('export_csv')}</Button>
            <Button size="small" variant="outlined" href="/api/v1/reorder-suggestions/export/?format=pdf">{t('export_pdf')}</Button>
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
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.sku}</TableCell>
                  <TableCell>${Number(product.price).toFixed(2)}</TableCell>
                  <TableCell width="40%">
                    <TextField
                      fullWidth
                      size="small"
                      value={draftStatus[product.id] || ''}
                      onChange={(e) => setDraftStatus((prev) => ({ ...prev, [product.id]: e.target.value }))}
                      placeholder={t('inventory_stock_status_placeholder')}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button variant="contained" size="small" onClick={() => saveStatus(product)}>
                      {t('save')}
                    </Button>
                  </TableCell>
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
