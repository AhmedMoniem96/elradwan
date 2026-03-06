import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { PageHeader, PageShell, DataTableCard } from '../components/PageLayout';
import { SharedFormSection, SharedTable, TableActionCell } from '../components/ui/patterns';
import { formatFieldErrors, normalizeCollectionResponse, parseApiError } from '../utils/api';

const initialForm = {
  code: '',
  name: '',
  timezone: 'UTC',
};

export default function Branches() {
  const { t } = useTranslation();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const dialogTitle = useMemo(() => (
    isEditing ? t('branches_edit_branch') : t('branches_add_branch')
  ), [isEditing, t]);

  const loadBranches = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/v1/branches/');
      setBranches(normalizeCollectionResponse(response.data));
    } catch (err) {
      const parsedError = parseApiError(err);
      const parsedMessage = formatFieldErrors(parsedError.fieldErrors) || parsedError.message;
      setError(parsedMessage || t('branches_load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleOpenCreate = () => {
    setForm(initialForm);
    setIsEditing(false);
    setSelectedBranchId(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (branch) => {
    setForm({
      code: branch.code || '',
      name: branch.name || '',
      timezone: branch.timezone || 'UTC',
    });
    setSelectedBranchId(branch.id);
    setIsEditing(true);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setForm(initialForm);
    setSelectedBranchId(null);
  };

  const handleSubmit = async () => {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      timezone: form.timezone.trim(),
    };

    if (!payload.code || !payload.name || !payload.timezone) {
      setError(t('branches_required_fields_error'));
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (isEditing && selectedBranchId) {
        await axios.put(`/api/v1/branches/${selectedBranchId}/`, payload);
      } else {
        await axios.post('/api/v1/branches/', payload);
      }

      await loadBranches();
      setSuccess(isEditing ? t('branches_update_success') : t('branches_create_success'));
      handleCloseDialog();
    } catch (err) {
      const parsedError = parseApiError(err);
      const parsedMessage = formatFieldErrors(parsedError.fieldErrors) || parsedError.message;
      setError(parsedMessage || t('branches_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (branch) => {
    setError('');
    try {
      await axios.patch(`/api/v1/branches/${branch.id}/`, {
        is_active: !branch.is_active,
      });
      await loadBranches();
      setSuccess(branch.is_active ? t('branches_deactivate_success') : t('branches_reactivate_success'));
    } catch (err) {
      const parsedError = parseApiError(err);
      const parsedMessage = formatFieldErrors(parsedError.fieldErrors) || parsedError.message;
      setError(parsedMessage || t('branches_toggle_status_error'));
    }
  };

  return (
    <PageShell>
      <PageHeader
        title={t('branches')}
        action={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            {t('branches_add_branch')}
          </Button>
        )}
      />

      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <DataTableCard>
        <SharedTable>
          <TableHead>
            <TableRow>
              <TableCell>{t('code')}</TableCell>
              <TableCell>{t('name')}</TableCell>
              <TableCell>{t('timezone')}</TableCell>
              <TableCell>{t('status')}</TableCell>
              <TableCell align="right">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {branches.map((branch) => (
              <TableRow key={branch.id} hover>
                <TableCell>{branch.code}</TableCell>
                <TableCell>{branch.name}</TableCell>
                <TableCell>{branch.timezone}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={branch.is_active ? t('active') : t('inactive')}
                    color={branch.is_active ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell align="right">
                  <TableActionCell>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => handleOpenEdit(branch)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      size="small"
                      color={branch.is_active ? 'warning' : 'success'}
                      variant="outlined"
                      startIcon={branch.is_active ? <ToggleOffIcon /> : <ToggleOnIcon />}
                      onClick={() => handleToggleActive(branch)}
                    >
                      {branch.is_active ? t('deactivate') : t('reactivate')}
                    </Button>
                  </TableActionCell>
                </TableCell>
              </TableRow>
            ))}
            {!loading && branches.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {t('branches_empty_state')}
                </TableCell>
              </TableRow>
            )}
            {loading && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  {t('branches_loading')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </SharedTable>
      </DataTableCard>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <SharedFormSection title={t('branches')} caption={t('branches_required_fields_error')}>
              <TextField
                autoFocus
                label={t('code')}
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                fullWidth
              />
              <TextField
                label={t('name')}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                fullWidth
              />
              <TextField
                label={t('timezone')}
                value={form.timezone}
                onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                fullWidth
              />
            </SharedFormSection>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
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
    </PageShell>
  );
}
