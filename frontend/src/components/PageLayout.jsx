import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import { formatPercent } from '../utils/formatters';

const spacingByDensity = {
  regular: { section: 2, card: 2, controls: 1.25 },
  dense: { section: 1.5, card: 1.5, controls: 1 },
};

export function DashboardLayoutShell({ children, dense = false, sx }) {
  const density = dense ? 'dense' : 'regular';
  return (
    <Box
      sx={{
        px: (theme) => theme.customSpacing?.page?.x || { xs: 2, md: 3 },
        py: (theme) => theme.customSpacing?.page?.y || { xs: 2, md: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: (theme) => spacingByDensity[density].section * (theme.customSpacing?.section || 1),
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export function PageShell({ children, sx, dense = false }) {
  return <DashboardLayoutShell dense={dense} sx={sx}>{children}</DashboardLayoutShell>;
}

export function PageHeader({ title, subtitle, action, dense = false }) {
  const density = dense ? 'dense' : 'regular';
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={(theme) => spacingByDensity[density].controls * (theme.customSpacing?.control || 1)}
    >
      <Box>
        <Typography sx={(theme) => theme.typography.pageTitle}>{title}</Typography>
        {subtitle ? <Typography color="text.secondary" sx={(theme) => theme.typography.body}>{subtitle}</Typography> : null}
      </Box>
      {action || null}
    </Stack>
  );
}

export function CardSection({ title, subtitle, children, action, contentSx, dense = false, sx }) {
  const density = dense ? 'dense' : 'regular';
  const cardSpacing = spacingByDensity[density].card;

  return (
    <Card variant="panel" sx={sx}>
      <CardContent
        sx={{
          p: (theme) => cardSpacing * (theme.customSpacing?.card || 1),
          '&:last-child': { pb: (theme) => cardSpacing * (theme.customSpacing?.card || 1) },
          ...contentSx,
        }}
      >
        {(title || subtitle || action) ? (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={(theme) => spacingByDensity[density].controls * (theme.customSpacing?.control || 1)}
            sx={{ mb: (theme) => spacingByDensity[density].controls * (theme.customSpacing?.control || 1) }}
          >
            <Box>
              {title ? <Typography sx={(theme) => theme.typography.sectionTitle}>{title}</Typography> : null}
              {subtitle ? <Typography color="text.secondary" sx={(theme) => theme.typography.captionText}>{subtitle}</Typography> : null}
            </Box>
            {action || null}
          </Stack>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

export function SectionPanel(props) {
  return <CardSection {...props} />;
}

export function DataTableCard({ children, dense = false, tableSx, ...props }) {
  return (
    <CardSection dense={dense} contentSx={{ p: 0, '&:last-child': { pb: 0 } }} {...props}>
      <Box sx={{ overflowX: 'auto', ...tableSx }}>
        {children}
      </Box>
    </CardSection>
  );
}

export function FormCard({ children, dense = false, stackProps, ...props }) {
  return (
    <CardSection dense={dense} {...props}>
      <Stack spacing={dense ? 1.25 : 2} {...stackProps}>
        {children}
      </Stack>
    </CardSection>
  );
}

const trendMeta = {
  up: { Icon: TrendingUpRoundedIcon, color: 'success.main', bg: 'success.light' },
  down: { Icon: TrendingDownRoundedIcon, color: 'error.main', bg: 'error.light' },
  flat: { Icon: TrendingFlatRoundedIcon, color: 'text.secondary', bg: 'action.hover' },
};

export function MetricCard({ title, value, deltaPct, trend = 'flat', loading = false, dense = false, helperText }) {
  const { Icon, color, bg } = trendMeta[trend] || trendMeta.flat;
  const hasDelta = Number.isFinite(deltaPct);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: dense ? 1.5 : 2,
        height: '100%',
        width: '100%',
        borderRadius: (theme) => theme.shape.cardRadius || 2,
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
          {helperText ? <Typography variant="body2" color="text.secondary">{helperText}</Typography> : null}
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
