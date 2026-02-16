import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
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
import { useSearchParams } from 'react-router-dom';


const parseAuditFiltersFromQuery = (params) => ({
  start_date: params.get('start_date') || '',
  end_date: params.get('end_date') || '',
  action: params.get('action') || '',
  entity: params.get('entity') || '',
  actor_id: params.get('actor_id') || '',
});

export default function AuditLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState(() => parseAuditFiltersFromQuery(searchParams));

  const loadLogs = async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const response = await axios.get('/api/v1/admin/audit-logs/', { params });
    setLogs(response.data || []);
  };

  const queryString = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters]);

  useEffect(() => {
    loadLogs();
  }, [queryString]);

  useEffect(() => {
    const incomingFilters = parseAuditFiltersFromQuery(searchParams);
    const hasChanges = Object.keys(incomingFilters).some((key) => incomingFilters[key] !== filters[key]);
    if (hasChanges) {
      setFilters(incomingFilters);
    }
  }, [filters, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams);
    }
  }, [filters, searchParams, setSearchParams]);

  const clearFilters = () => {
    setFilters({ start_date: '', end_date: '', action: '', entity: '', actor_id: '' });
  };

  const exportLogs = () => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    window.location.href = `/api/v1/admin/audit-logs/export/?${params.toString()}`;
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Audit Logs</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField label="Start date (ISO)" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} fullWidth />
          <TextField label="End date (ISO)" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} fullWidth />
          <TextField label="Action" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} fullWidth />
          <TextField label="Entity" value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })} fullWidth />
          <TextField label="User ID" value={filters.actor_id} onChange={(e) => setFilters({ ...filters, actor_id: e.target.value })} fullWidth />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={loadLogs}>Apply</Button>
          <Button variant="outlined" onClick={exportLogs}>Export CSV</Button>
          <Button variant="text" onClick={clearFilters}>Clear filters</Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Entity</TableCell>
              <TableCell>Event ID</TableCell>
              <TableCell>Request ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{log.created_at}</TableCell>
                <TableCell>{log.actor_username || '-'}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entity}</TableCell>
                <TableCell>{log.event_id || '-'}</TableCell>
                <TableCell>{log.request_id || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
