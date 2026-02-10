import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
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

export default function Inventory() {
  const { t } = useTranslation();
  const { enqueueEvent, pushNow, pullNow } = useSync();
  const [products, setProducts] = useState([]);
  const [draftStatus, setDraftStatus] = useState({});
  const [error, setError] = useState('');

  const fetchProducts = async () => {
    try {
      const response = await axios.get('/api/v1/products/');
      setProducts(response.data);
      setDraftStatus(
        response.data.reduce((acc, p) => {
          acc[p.id] = p.stock_status || '';
          return acc;
        }, {}),
      );
      setError('');
    } catch (err) {
      console.error('Failed to load products', err);
      setError('Failed to load products');
    }
  };

  useEffect(() => {
    fetchProducts();
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
      await fetchProducts();
    } catch (err) {
      console.error('Failed to save status', err);
      setError('Failed to save stock status');
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        {t('inventory')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Add a custom stock status for each product (for example: in stock, out of stock, arriving tomorrow).
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper}>
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
                    onChange={(e) =>
                      setDraftStatus((prev) => ({ ...prev, [product.id]: e.target.value }))
                    }
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
    </Box>
  );
}
