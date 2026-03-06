import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { PageShell, PageHeader, CardSection } from '../components/PageLayout';
import { normalizeCollectionResponse } from '../utils/api';

const stateColor = {
  uploaded: 'default',
  parsed: 'info',
  review: 'warning',
  applied: 'success',
  failed: 'error',
};

const requiredFields = ['sku', 'name', 'quantity', 'price'];

function normalizeAction(value) {
  if (!value) return { action: 'skip', product_id: '' };
  if (typeof value === 'string') return { action: value === 'match_sku' ? 'match_existing' : value, product_id: '' };
  return { action: value.action || 'skip', product_id: value.product_id || '' };
}

export default function PurchaseImports() {
  const [jobs, setJobs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [activeJobId, setActiveJobId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [columnMapping, setColumnMapping] = useState({});
  const [rowActions, setRowActions] = useState({});
  const [supplierId, setSupplierId] = useState('');

  const loadJobs = async () => {
    try {
      const [jobsResponse, suppliersResponse] = await Promise.all([
        axios.get('/api/v1/purchase-import-jobs/'),
        axios.get('/api/v1/admin/suppliers/'),
      ]);
      const rows = normalizeCollectionResponse(jobsResponse.data);
      setJobs(rows);
      setSuppliers(normalizeCollectionResponse(suppliersResponse.data));
      if (!activeJobId && rows[0]) {
        setActiveJobId(rows[0].id);
      }
      setError('');
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load purchase import jobs.');
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const activeJob = useMemo(() => jobs.find((job) => job.id === activeJobId) || null, [jobs, activeJobId]);

  useEffect(() => {
    if (!activeJob) return;
    setColumnMapping(activeJob.column_mapping || {});
    const next = {};
    (activeJob.parsed_rows || []).forEach((row) => {
      const key = String(row.row_index);
      const existing = normalizeAction((activeJob.row_actions || {})[key]);
      next[key] = {
        action: existing.action || row.suggested_action || 'skip',
        product_id: existing.product_id || row.suggested_product_id || '',
      };
    });
    setRowActions(next);
    setSupplierId(activeJob.supplier || '');
  }, [activeJob]);

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('source_file', file);
    if (supplierId) {
      form.append('supplier', supplierId);
    }

    setUploading(true);
    try {
      await axios.post('/api/v1/purchase-import-jobs/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadJobs();
      setError('');
    } catch (uploadError) {
      console.error(uploadError);
      setError('Upload failed. Please use a valid CSV or PDF file.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const hasBlockingSelection = useMemo(() => {
    if (!activeJob) return false;
    return (activeJob.parsed_rows || []).some((row) => {
      const key = String(row.row_index);
      const action = normalizeAction(rowActions[key]);
      return action.action === 'match_existing' && row.requires_selection && !action.product_id;
    });
  }, [activeJob, rowActions]);

  const applyRows = async () => {
    if (!activeJob) return;

    try {
      await axios.post(`/api/v1/purchase-import-jobs/${activeJob.id}/apply/`, { row_actions: rowActions });
      await loadJobs();
      setError('');
    } catch (applyError) {
      console.error(applyError);
      setError('Failed to apply imported rows.');
    }
  };

  return (
    <PageShell>
      <PageHeader title="Purchase Imports" subtitle="Upload CSV or PDF files, review parsed rows, and apply import actions." />
      {error ? <Alert severity="error">{error}</Alert> : null}

      <CardSection title="Upload" subtitle="CSV supports structured column mapping; PDF runs OCR/parsing with confidence scoring.">
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Supplier</InputLabel>
              <Select value={supplierId} label="Supplier" onChange={(event) => setSupplierId(event.target.value)}>
                <MenuItem value=""><em>Unknown supplier</em></MenuItem>
                {suppliers.map((supplier) => (
                  <MenuItem key={supplier.id} value={supplier.id}>{supplier.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" component="label" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload CSV/PDF'}
              <input hidden type="file" accept=".csv,.pdf" onChange={uploadFile} />
            </Button>
            <Typography variant="body2" color="text.secondary">Supported: CSV, PDF</Typography>
          </Stack>

          {activeJob?.file_type === 'csv' ? (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              {requiredFields.map((field) => (
                <FormControl key={field} size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>{`Map ${field}`}</InputLabel>
                  <Select
                    label={`Map ${field}`}
                    value={columnMapping[field] || ''}
                    onChange={(event) => setColumnMapping((prev) => ({ ...prev, [field]: event.target.value }))}
                  >
                    <MenuItem value=""><em>Not mapped</em></MenuItem>
                    {(activeJob?.detected_columns || []).map((col) => (
                      <MenuItem key={col} value={col}>{col}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
            </Stack>
          ) : null}

          {activeJob?.file_type === 'pdf' ? (
            <Typography variant="body2" color="text.secondary">
              OCR confidence: {activeJob?.parse_confidence || 0}%
            </Typography>
          ) : null}
        </Stack>
      </CardSection>

      <CardSection title="Import History">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>File</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Rows</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {jobs.map((job) => (
              <TableRow
                key={job.id}
                hover
                selected={job.id === activeJobId}
                sx={{ cursor: 'pointer' }}
                onClick={() => setActiveJobId(job.id)}
              >
                <TableCell>{job.source_filename}</TableCell>
                <TableCell>{job.file_type?.toUpperCase()}</TableCell>
                <TableCell><Chip size="small" color={stateColor[job.state] || 'default'} label={job.state} /></TableCell>
                <TableCell>{(job.parsed_rows || []).length}</TableCell>
                <TableCell>{new Date(job.updated_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardSection>

      <CardSection
        title="Review Grid"
        subtitle="Set row-level actions before applying changes."
        action={<Button variant="contained" onClick={applyRows} disabled={!activeJob || (activeJob.parsed_rows || []).length === 0 || hasBlockingSelection}>Apply</Button>}
      >
        {hasBlockingSelection ? <Alert severity="warning">Some rows have multiple matches. Please select a product before apply.</Alert> : null}
        {!activeJob ? (
          <Typography color="text.secondary">Select an import job to review rows.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Barcode</TableCell>
                  <TableCell>SKU</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(activeJob.parsed_rows || []).map((row) => {
                  const key = String(row.row_index);
                  const action = normalizeAction(rowActions[key]);
                  const candidates = row.match_candidates || [];
                  return (
                    <TableRow key={key} sx={row.low_confidence ? { bgcolor: 'warning.light' } : undefined}>
                      <TableCell>{row.row_index}</TableCell>
                      <TableCell>{row.barcode || '-'}</TableCell>
                      <TableCell>{row.sku || '-'}</TableCell>
                      <TableCell>{row.name || '-'}</TableCell>
                      <TableCell>{row.quantity || '-'}</TableCell>
                      <TableCell>{row.price || '-'}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={`${Math.round((row.match_confidence || 0) * 100)}%`} color={row.low_confidence ? 'warning' : 'success'} />
                          {row.requires_selection ? <Chip size="small" label="Multi-match" color="warning" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          <FormControl size="small" sx={{ minWidth: 220 }}>
                            <Select
                              value={action.action}
                              onChange={(event) => setRowActions((prev) => ({ ...prev, [key]: { ...action, action: event.target.value } }))}
                            >
                              <MenuItem value="create_product">Quick-create product</MenuItem>
                              <MenuItem value="match_existing">Match existing product</MenuItem>
                              <MenuItem value="skip">Skip row</MenuItem>
                            </Select>
                          </FormControl>
                          {action.action === 'match_existing' ? (
                            <FormControl size="small" sx={{ minWidth: 260 }}>
                              <InputLabel>Select product</InputLabel>
                              <Select
                                label="Select product"
                                value={action.product_id}
                                onChange={(event) => setRowActions((prev) => ({ ...prev, [key]: { ...action, product_id: event.target.value } }))}
                              >
                                <MenuItem value=""><em>{row.requires_selection ? 'Required for this row' : 'Use suggested match'}</em></MenuItem>
                                {candidates.map((candidate) => (
                                  <MenuItem key={candidate.product_id} value={candidate.product_id}>
                                    {candidate.product_name} ({candidate.product_sku || 'No SKU'})
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardSection>
    </PageShell>
  );
}
