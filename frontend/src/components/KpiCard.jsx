import React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import { formatPercent } from '../utils/formatters';

const trendMeta = {
  up: { Icon: TrendingUpRoundedIcon, color: 'success.main' },
  down: { Icon: TrendingDownRoundedIcon, color: 'error.main' },
  flat: { Icon: TrendingFlatRoundedIcon, color: 'text.secondary' },
};

export default function KpiCard({
  title,
  value,
  deltaPct,
  trend = 'flat',
  loading = false,
}) {
  const { Icon, color } = trendMeta[trend] || trendMeta.flat;
  const hasDelta = Number.isFinite(deltaPct);

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      {loading ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Skeleton variant="text" width="70%" height={40} />
          <Skeleton variant="text" width="45%" />
        </Stack>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography variant="h5" fontWeight={700}>{value}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color }}>
            <Icon fontSize="small" />
            <Typography variant="caption" sx={{ color }}>
              {hasDelta ? formatPercent(deltaPct) : '—'}
            </Typography>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
