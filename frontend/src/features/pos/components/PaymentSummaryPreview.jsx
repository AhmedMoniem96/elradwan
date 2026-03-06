import { Stack, Typography, Divider, Button } from '@mui/material';

export default function PaymentSummaryPreview() {
  return (
    <Stack spacing={1}>
      <Typography variant="h6">Payment Summary</Typography>
      <Typography>Subtotal: $210.00</Typography>
      <Typography>Tax: $31.50</Typography>
      <Divider />
      <Typography fontWeight={700}>Total: $241.50</Typography>
      <Button variant="contained">Complete Sale</Button>
    </Stack>
  );
}
