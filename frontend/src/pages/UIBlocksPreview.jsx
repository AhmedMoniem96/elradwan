import { Stack, Typography } from '@mui/material';
import Panel from '../components/ui/Panel';
import KpiBlockPreview from '../features/dashboard/components/KpiBlockPreview';
import InventoryFilterPreview from '../features/inventory/components/InventoryFilterPreview';
import PaymentSummaryPreview from '../features/pos/components/PaymentSummaryPreview';

export default function UIBlocksPreview() {
  return (
    <Stack spacing={2}>
      <Typography variant="h4">UI Blocks Preview</Typography>
      <Panel compact>
        <KpiBlockPreview />
      </Panel>
      <Panel compact>
        <InventoryFilterPreview />
      </Panel>
      <Panel compact>
        <PaymentSummaryPreview />
      </Panel>
    </Stack>
  );
}
