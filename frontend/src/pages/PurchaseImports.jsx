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

export default function PurchaseImports() {
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [columnMapping, setColumnMapping] = useState({});
  const [rowActions, setRowActions] = useState({});

  const loadJobs = async () => {
    try {
      const response = await axios.get('/api/v1/purchase-import-jobs/');
      const rows = normalizeCollectionResponse(response.data);
      setJobs(rows);
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
    setRowActions(activeJob.row_actions || {});
  }, [activeJob]);

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const form = new FormData();
    form.append('source_file', file);

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
          <Stack direction="row" spacing={1} alignItems="center">
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
        action={<Button variant="contained" onClick={applyRows} disabled={!activeJob || (activeJob.parsed_rows || []).length === 0}>Apply</Button>}
      >
        {!activeJob ? (
          <Typography color="text.secondary">Select an import job to review rows.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>SKU</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Price</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(activeJob.parsed_rows || []).map((row) => {
                  const key = String(row.row_index);
                  return (
                    <TableRow key={key}>
                      <TableCell>{row.row_index}</TableCell>
                      <TableCell>{row.sku || '-'}</TableCell>
                      <TableCell>{row.name || '-'}</TableCell>
                      <TableCell>{row.quantity || '-'}</TableCell>
                      <TableCell>{row.price || '-'}</TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                          <Select
                            value={rowActions[key] || 'create_product'}
                            onChange={(event) => setRowActions((prev) => ({ ...prev, [key]: event.target.value }))}
                          >
                            <MenuItem value="create_product">Create product</MenuItem>
                            <MenuItem value="match_sku">Match existing SKU</MenuItem>
                            <MenuItem value="skip">Skip row</MenuItem>
                          </Select>
                        </FormControl>
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
