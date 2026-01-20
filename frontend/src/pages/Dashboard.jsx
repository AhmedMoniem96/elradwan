import React from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t } = useTranslation();

  return (
    <Grid container spacing={3}>
      {/* Chart */}
      <Grid item xs={12} md={8} lg={9}>
        <Paper
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 240,
          }}
        >
          <Typography variant="h6" gutterBottom>
            {t('todays_sales')}
          </Typography>
          <Typography component="p" variant="h4">
            $3,024.00
          </Typography>
          <Typography color="text.secondary" sx={{ flex: 1 }}>
            on 15 March, 2024
          </Typography>
        </Paper>
      </Grid>
      {/* Recent Deposits */}
      <Grid item xs={12} md={4} lg={3}>
        <Paper
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            height: 240,
          }}
        >
          <Typography variant="h6" gutterBottom>
            {t('active_register')}
          </Typography>
          <Typography component="p" variant="h4">
            Main POS
          </Typography>
          <Typography color="text.secondary" sx={{ flex: 1 }}>
            {t('status')}: {t('online')}
          </Typography>
        </Paper>
      </Grid>
      {/* Recent Orders */}
      <Grid item xs={12}>
        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" gutterBottom>
            {t('recent_transactions')}
          </Typography>
          <Typography>
            {t('no_transactions')}
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}
