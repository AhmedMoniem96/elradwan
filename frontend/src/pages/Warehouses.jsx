import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Snackbar,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const initialForm = {
  name: '',
  is_primary: false,
  is_active: true,
};

const getValidationMessage = (data, fallback) => {
  if (!data || typeof data !== 'object') return fallback;

  const messages = [];
  Object.values(data).forEach((value) => {
    if (typeof value === 'string') {
      messages.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((nested) => {
        if (typeof nested === 'string') {
          messages.push(nested);
        }
      });
    }
  });

  if (messages.length > 0) {
    return messages.join(' ');
  }

  return data.detail || fallback;
};

export default function Warehouses() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const dialogTitle = useMemo(() => (
    isEditing ? t('warehouses_edit_warehouse') : t('warehouses_add_warehouse')
  ), [isEditing, t]);

  const loadWarehouses = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/v1/warehouses/');
      setWarehouses(response.data || []);
    } catch (err) {
      setError(err.response?.data?.detail || t('warehouses_load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, []);

  const handleOpenCreate = () => {
    setForm(initialForm);
    setIsEditing(false);
    setSelectedWarehouseId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (warehouse) => {
    setForm({
      name: warehouse.name || '',
      is_primary: Boolean(warehouse.is_primary),
      is_active: Boolean(warehouse.is_active),
    });
    setSelectedWarehouseId(warehouse.id);
    setIsEditing(true);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setForm(initialForm);
    setSelectedWarehouseId(null);
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      is_primary: Boolean(form.is_primary),
      is_active: Boolean(form.is_active),
    };

    if (!payload.name) {
      setError(t('warehouses_name_required'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (isEditing && selectedWarehouseId) {
        await axios.put(`/api/v1/admin/warehouses/${selectedWarehouseId}/`, payload);
      } else {
        await axios.post('/api/v1/admin/warehouses/', payload);
      }

      await loadWarehouses();
      setSuccess(isEditing ? t('warehouses_update_success') : t('warehouses_create_success'));
      handleCloseDialog();
    } catch (err) {
      const message = getValidationMessage(err.response?.data, t('warehouses_save_error'));
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (warehouse) => {
    setError('');
    setDeletingId(warehouse.id);
    try {
      await axios.delete(`/api/v1/admin/warehouses/${warehouse.id}/`);
      await loadWarehouses();
      setSuccess(t('warehouses_delete_success'));
    } catch (err) {
      const message = getValidationMessage(err.response?.data, t('warehouses_delete_error'));
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">{t('warehouses')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          {t('warehouses_add_warehouse')}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('name')}</TableCell>
              <TableCell>{t('warehouses_primary')}</TableCell>
              <TableCell>{t('status')}</TableCell>
              <TableCell align="right">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {warehouses.map((warehouse) => (
              <TableRow key={warehouse.id} hover>
                <TableCell>{warehouse.name}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={warehouse.is_primary ? t('yes') : t('no')}
                    color={warehouse.is_primary ? 'primary' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={warehouse.is_active ? t('active') : t('inactive')}
                    color={warehouse.is_active ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => handleOpenEdit(warehouse)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDelete(warehouse)}
                      disabled={deletingId === warehouse.id}
                    >
                      {deletingId === warehouse.id ? t('deleting') : t('delete')}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && warehouses.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  {t('warehouses_empty_state')}
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  {t('warehouses_loading')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('name')}
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            fullWidth
          />
          <FormControlLabel
            control={(
              <Switch
                checked={form.is_primary}
                onChange={(e) => setForm((prev) => ({ ...prev, is_primary: e.target.checked }))}
              />
            )}
            label={t('warehouses_primary')}
            sx={{ mt: 1 }}
          />
          <FormControlLabel
            control={(
              <Switch
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
            )}
            label={t('active')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{t('cancel')}</Button>
          <Button onClick={handleSubmit} disabled={saving} variant="contained">
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
}
