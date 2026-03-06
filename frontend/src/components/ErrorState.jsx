import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';

export default function ErrorState({
  icon: Icon = ErrorOutlineRoundedIcon,
  title = 'حصلت مشكلة',
  helperText = 'في حاجة حصلت غلط، جرّب تاني.',
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
        borderColor: 'error.light',
        color: 'text.secondary',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ color: 'error.main' }}>
        <Icon />
      </Box>
      <Typography variant="body2" fontWeight={700}>{title}</Typography>
      <Typography variant="caption" textAlign="center">{helperText}</Typography>
      {actionLabel && onAction && (
        <Button size="small" variant="contained" color="error" onClick={onAction}>{actionLabel}</Button>
      )}
    </Stack>
  );
}
