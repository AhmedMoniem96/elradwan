import { Stack, TextField, MenuItem, Button } from '@mui/material';

export default function InventoryFilterPreview() {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
      <TextField size="small" label="Warehouse" select defaultValue="">
        <MenuItem value="">All</MenuItem>
        <MenuItem value="1">Main Warehouse</MenuItem>
      </TextField>
      <TextField size="small" label="Severity" select defaultValue="">
        <MenuItem value="">All</MenuItem>
        <MenuItem value="critical">Critical</MenuItem>
      </TextField>
      <Button variant="outlined">Reset</Button>
      <Button variant="contained">Create PO from Suggestions</Button>
    </Stack>
  );
}
