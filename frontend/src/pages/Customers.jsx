import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Stack,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useSync } from '../sync/SyncContext';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import LoadingState from '../components/LoadingState';
import { DataTableCard, PageHeader, PageShell } from '../components/PageLayout';
import { SharedFormSection, SharedTable, TableActionCell } from '../components/ui/patterns';
import { normalizeCollectionResponse } from '../utils/api';

export default function Customers() {
  const { t } = useTranslation();
  const { enqueueEvent, pushNow, pullNow } = useSync();
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState({
    name: '',
    phone: '',
    email: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/v1/customers/');
      setCustomers(normalizeCollectionResponse(response.data));
      setError('');
    } catch (fetchError) {
      console.error('Error fetching customers:', fetchError);
      setError('مش قادرين نحمل العملاء دلوقتي. جرّب تاني.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpen = (customer = null) => {
    if (customer) {
      setCurrentCustomer(customer);
      setIsEditing(true);
    } else {
      setCurrentCustomer({ name: '', phone: '', email: '' });
      setIsEditing(false);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setCurrentCustomer({ name: '', phone: '', email: '' });
  };

  const handleSave = async () => {
    try {
      const customerId = currentCustomer.id || crypto.randomUUID();
      enqueueEvent({
        eventType: 'customer.upsert',
        payload: {
          customer_id: customerId,
          name: currentCustomer.name,
          phone: currentCustomer.phone,
          email: currentCustomer.email,
        },
      });
      await pushNow();
      await pullNow();
      await fetchCustomers();
      handleClose();
    } catch (saveError) {
      console.error('Error saving customer:', saveError);
      handleClose();
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('customers_delete_confirmation'))) {
      try {
        enqueueEvent({
          eventType: 'customer.delete',
          payload: {
            customer_id: id,
          },
        });
        await pushNow();
        await pullNow();
        await fetchCustomers();
      } catch (deleteError) {
        console.error('Error deleting customer:', deleteError);
      }
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={t('customers')}
        action={(
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpen()}
          >
            {t('add_customer')}
          </Button>
        )}
      />

      <DataTableCard>
        {error && (
          <Box sx={{ p: 2 }}>
            <ErrorState
              icon={GroupOutlinedIcon}
              title="في مشكلة في تحميل العملاء"
              helperText={error}
              actionLabel="جرّب تاني"
              onAction={fetchCustomers}
            />
          </Box>
        )}
        {!error && isLoading && (
          <Box sx={{ p: 2 }}>
            <LoadingState
              icon={GroupOutlinedIcon}
              title="بنحمّل بيانات العملاء"
              helperText="استنّى ثانية وهتظهر البيانات."
            />
          </Box>
        )}
        {!error && !isLoading && customers.length === 0 && (
          <Box sx={{ p: 2 }}>
            <EmptyState
              icon={GroupOutlinedIcon}
              title="لسه مفيش عملاء"
              helperText="ابدأ بإضافة عميل جديد عشان تتابع مبيعاتك بسهولة."
              actionLabel={t('add_customer')}
              onAction={() => handleOpen()}
            />
          </Box>
        )}
        {!error && !isLoading && customers.length > 0 && (
          <SharedTable>
            <TableHead>
              <TableRow>
                <TableCell>{t('name')}</TableCell>
                <TableCell>{t('phone')}</TableCell>
                <TableCell>{t('email')}</TableCell>
                <TableCell align="right">{t('actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} hover>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell align="right">
                    <TableActionCell sx={{ minWidth: 90 }}>
                      <IconButton onClick={() => handleOpen(customer)} color="primary" size="small">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton onClick={() => handleDelete(customer.id)} color="error" size="small">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableActionCell>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </SharedTable>
        )}
      </DataTableCard>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>{isEditing ? t('edit') : t('add_customer')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <SharedFormSection title={t('customers')}>
              <TextField
                autoFocus
                label={t('name')}
                fullWidth
                value={currentCustomer.name}
                onChange={(e) => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
              />
              <TextField
                label={t('phone')}
                fullWidth
                value={currentCustomer.phone}
                onChange={(e) => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })}
              />
              <TextField
                label={t('email')}
                fullWidth
                value={currentCustomer.email}
                onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })}
              />
            </SharedFormSection>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose}>{t('cancel')}</Button>
          <Button onClick={handleSave} variant="contained">
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
