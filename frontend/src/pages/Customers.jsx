import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
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
import { PageHeader, PageShell, SectionPanel } from '../components/PageLayout';

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
      setCustomers(response.data);
      setError('');
    } catch (error) {
      console.error('Error fetching customers:', error);
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
    } catch (error) {
      console.error('Error saving customer:', error);
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
      } catch (error) {
        console.error('Error deleting customer:', error);
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

      <SectionPanel contentSx={{ p: 0, '&:last-child': { pb: 0 } }}>
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
        <TableContainer>
        <Table>
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
              <TableRow key={customer.id}>
                <TableCell>{customer.name}</TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell>{customer.email}</TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => handleOpen(customer)} color="primary">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(customer.id)} color="error">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </TableContainer>
        )}
      </SectionPanel>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{isEditing ? t('edit') : t('add_customer')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('name')}
            fullWidth
            value={currentCustomer.name}
            onChange={(e) => setCurrentCustomer({ ...currentCustomer, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label={t('phone')}
            fullWidth
            value={currentCustomer.phone}
            onChange={(e) => setCurrentCustomer({ ...currentCustomer, phone: e.target.value })}
          />
          <TextField
            margin="dense"
            label={t('email')}
            fullWidth
            value={currentCustomer.email}
            onChange={(e) => setCurrentCustomer({ ...currentCustomer, email: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{t('cancel')}</Button>
          <Button onClick={handleSave} variant="contained">
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
