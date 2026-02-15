import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

export default function EmptyState({
  icon: Icon = InboxOutlinedIcon,
  title = 'مفيش بيانات دلوقتي',
  helperText = 'جرّب تغيّر الفلاتر أو ضيف بيانات جديدة.',
  actionLabel,
  onAction,
}) {
  return (
    <Stack
      spacing={1}
      alignItems="center"
      justifyContent="center"
      sx={{
        py: 3,
        px: 2,
        borderRadius: 2,
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
      {actionLabel && onAction && (
        <Button size="small" variant="outlined" onClick={onAction}>{actionLabel}</Button>
      )}
    </Stack>
  );
}
