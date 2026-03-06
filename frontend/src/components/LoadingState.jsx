import React from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';

export default function LoadingState({
  icon: Icon = HourglassTopRoundedIcon,
  title = 'ثانية واحدة بنحمّل البيانات',
  helperText = 'استنّى معايا لحظات.',
  actionLabel,
  onAction,
}) {
  return (
    <Stack
      spacing={(theme) => theme.customSpacing?.control || 1}
      alignItems="center"
      justifyContent="center"
      sx={{
        py: (theme) => theme.customSpacing?.section || 2,
        px: (theme) => theme.customSpacing?.card || 2,
        borderRadius: (theme) => theme.shape.cardRadius || 12,
        border: '1px dashed',
        borderColor: 'divider',
        color: 'text.secondary',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ color: 'text.disabled' }}>
        <Icon />
      </Box>
      <Typography variant="body2" fontWeight={700}>{title}</Typography>
      <Typography variant="caption" textAlign="center">{helperText}</Typography>
      <CircularProgress size={24} />
      {actionLabel && onAction && (
        <Button size="small" variant="outlined" onClick={onAction}>{actionLabel}</Button>
      )}
    </Stack>
  );
}
