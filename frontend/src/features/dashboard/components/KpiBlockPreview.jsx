import { Stack } from '@mui/material';
import { MetricCard } from '../../../components/PageLayout';

export default function KpiBlockPreview() {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <MetricCard title="Gross Sales" value="$12,450" helperText="+12% vs last period" tone="success" />
      <MetricCard title="Invoices" value="324" helperText="Stable trend" tone="info" />
      <MetricCard title="AR Balance" value="$2,180" helperText="-4% vs last period" tone="warning" />
    </Stack>
  );
}
