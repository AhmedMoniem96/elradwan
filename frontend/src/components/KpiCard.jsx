import React from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import { formatPercent } from '../utils/formatters';

const trendMeta = {
  up: { Icon: TrendingUpRoundedIcon, color: 'success.main', bg: 'success.light' },
  down: { Icon: TrendingDownRoundedIcon, color: 'error.main', bg: 'error.light' },
  flat: { Icon: TrendingFlatRoundedIcon, color: 'text.secondary', bg: 'action.hover' },
};

export default function KpiCard({
  title,
  value,
  deltaPct,
  trend = 'flat',
  loading = false,
}) {
  const { Icon, color, bg } = trendMeta[trend] || trendMeta.flat;
  const hasDelta = Number.isFinite(deltaPct);

  return (
    <Paper
      sx={{
        p: 2,
        height: '100%',
        width: '100%',
        borderRadius: (theme) => theme.shape.cardRadius || 2,
        border: '1px solid',
        borderColor: 'divider',
        backgroundImage: (theme) => `linear-gradient(180deg, ${theme.palette.action.hover} 0%, transparent 45%)`,
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{title}</Typography>
      {loading ? (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Skeleton variant="text" width="70%" height={40} />
          <Skeleton variant="text" width="45%" />
        </Stack>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography variant="h5" fontWeight={800}>{value}</Typography>
          <Chip
            size="small"
            icon={<Icon fontSize="small" />}
            label={hasDelta ? formatPercent(deltaPct) : '—'}
            sx={{
              width: 'fit-content',
              color,
              bgcolor: bg,
              fontWeight: 700,
              '& .MuiChip-icon': { color },
            }}
          />
        </Stack>
      )}
    </Paper>
  );
}
