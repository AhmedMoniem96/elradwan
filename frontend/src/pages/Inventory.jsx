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
      const [productsRes, warehousesRes, transferRes] = await Promise.all([
        axios.get('/api/v1/products/'),
        axios.get('/api/v1/warehouses/'),
        axios.get('/api/v1/stock-transfers/'),
      ]);
      setProducts(productsRes.data);
      setWarehouses(warehousesRes.data);
      setTransfers(transferRes.data);
      setDraftStatus(
        productsRes.data.reduce((acc, p) => {
          acc[p.id] = p.stock_status || '';
          return acc;
        }, {}),
      );
      setError('');
    } catch (err) {
      console.error('Failed to load inventory data', err);
      setError('Failed to load inventory data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
      setError('Failed to save stock status');
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
      setError('Failed to create transfer');
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
      setError('Failed to approve transfer');
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
      setError('Failed to complete transfer');
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('inventory')}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Product Stock Status</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('name')}</TableCell>
                <TableCell>SKU</TableCell>
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
                      placeholder="in stock / out of stock"
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
        <Typography variant="h6" sx={{ mb: 2 }}>Create Stock Transfer</Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField select label="Source Warehouse" value={transferForm.source_warehouse_id} onChange={(e) => setTransferForm((prev) => ({ ...prev, source_warehouse_id: e.target.value }))} fullWidth>
              {warehouses.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</MenuItem>)}
            </TextField>
            <TextField select label="Destination Warehouse" value={transferForm.destination_warehouse_id} onChange={(e) => setTransferForm((prev) => ({ ...prev, destination_warehouse_id: e.target.value }))} fullWidth>
              {warehouses.map((warehouse) => <MenuItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label="Reference" value={transferForm.reference} onChange={(e) => setTransferForm((prev) => ({ ...prev, reference: e.target.value }))} fullWidth />
            <TextField label="Notes" value={transferForm.notes} onChange={(e) => setTransferForm((prev) => ({ ...prev, notes: e.target.value }))} fullWidth />
          </Stack>
          <FormControlLabel
            control={<Switch checked={transferForm.requires_supervisor_approval} onChange={(e) => setTransferForm((prev) => ({ ...prev, requires_supervisor_approval: e.target.checked }))} />}
            label="Requires supervisor approval"
          />
          {transferForm.lines.map((line, index) => (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} key={`line-${index}`}>
              <TextField select label="Product" value={line.product} onChange={(e) => setTransferForm((prev) => ({ ...prev, lines: prev.lines.map((entry, i) => (i === index ? { ...entry, product: e.target.value } : entry)) }))} fullWidth>
                {products.map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
              </TextField>
              <TextField label="Quantity" value={line.quantity} onChange={(e) => setTransferForm((prev) => ({ ...prev, lines: prev.lines.map((entry, i) => (i === index ? { ...entry, quantity: e.target.value } : entry)) }))} fullWidth />
            </Stack>
          ))}
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={() => setTransferForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine] }))}>Add Line</Button>
            <Button variant="contained" disabled={!canCreateTransfer} onClick={createTransfer}>Create Transfer</Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Stock Transfers</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Reference</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Destination</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Lines</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell>{transfer.reference}</TableCell>
                  <TableCell>{warehouses.find((w) => w.id === transfer.source_warehouse)?.name || '-'}</TableCell>
                  <TableCell>{warehouses.find((w) => w.id === transfer.destination_warehouse)?.name || '-'}</TableCell>
                  <TableCell><Chip label={transfer.status} size="small" /></TableCell>
                  <TableCell>{(transfer.lines || []).map((line) => `${line.product_name || line.product} (${line.quantity})`).join(', ')}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      {transfer.status === 'draft' && <Button size="small" variant="outlined" onClick={() => approveTransfer(transfer.id)}>Approve</Button>}
                      {transfer.status === 'approved' && <Button size="small" variant="contained" onClick={() => completeTransfer(transfer.id)}>Complete</Button>}
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
