import React, { useEffect, useState } from 'react';
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

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ start_date: '', end_date: '', action: '', entity: '', actor_id: '' });

  const loadLogs = async () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const response = await axios.get('/api/v1/admin/audit-logs/', { params });
    setLogs(response.data || []);
  };

  useEffect(() => {
    loadLogs();
  }, []);

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
