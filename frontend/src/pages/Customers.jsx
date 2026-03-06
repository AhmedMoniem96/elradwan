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
  Chip,
  MenuItem,
  FormControlLabel,
  Checkbox,
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
    email: '',
    pricing_mode: 'unit',
    allow_unit_override: false,
    allow_package_override: false,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pricingModeFilter, setPricingModeFilter] = useState('all');

  useEffect(() => {
    fetchCustomers();
  }, [pricingModeFilter]);

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/v1/customers/', {
        params: pricingModeFilter === 'all' ? {} : { pricing_mode: pricingModeFilter },
      });
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
      setCurrentCustomer({ name: '', phone: '', email: '', pricing_mode: 'unit', allow_unit_override: false, allow_package_override: false });
      setIsEditing(false);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setCurrentCustomer({ name: '', phone: '', email: '', pricing_mode: 'unit', allow_unit_override: false, allow_package_override: false });
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
          pricing_mode: currentCustomer.pricing_mode || 'unit',
          allow_unit_override: Boolean(currentCustomer.allow_unit_override),
          allow_package_override: Boolean(currentCustomer.allow_package_override),
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

      <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
        <Chip label={t('all')} color={pricingModeFilter === 'all' ? 'primary' : 'default'} onClick={() => setPricingModeFilter('all')} />
        <Chip label={t('pricing_mode_unit')} color={pricingModeFilter === 'unit' ? 'primary' : 'default'} onClick={() => setPricingModeFilter('unit')} />
        <Chip label={t('pricing_mode_package')} color={pricingModeFilter === 'package' ? 'primary' : 'default'} onClick={() => setPricingModeFilter('package')} />
      </Stack>

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
                <TableCell>{t('pricing_mode')}</TableCell>
                <TableCell align="right">{t('actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} hover>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.phone}</TableCell>
                  <TableCell>{customer.email}</TableCell>
                  <TableCell><Chip size="small" label={t(`pricing_mode_${customer.pricing_mode || 'unit'}`)} /></TableCell>
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
              <TextField
                label={t('pricing_mode')}
                select
                fullWidth
                value={currentCustomer.pricing_mode || 'unit'}
                onChange={(e) => setCurrentCustomer({ ...currentCustomer, pricing_mode: e.target.value })}
              >
                <MenuItem value="unit">{t('pricing_mode_unit')}</MenuItem>
                <MenuItem value="package">{t('pricing_mode_package')}</MenuItem>
              </TextField>
              <FormControlLabel
                control={<Checkbox checked={Boolean(currentCustomer.allow_unit_override)} onChange={(e) => setCurrentCustomer({ ...currentCustomer, allow_unit_override: e.target.checked })} />}
                label={t('allow_unit_override')}
              />
              <FormControlLabel
                control={<Checkbox checked={Boolean(currentCustomer.allow_package_override)} onChange={(e) => setCurrentCustomer({ ...currentCustomer, allow_package_override: e.target.checked })} />}
                label={t('allow_package_override')}
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
