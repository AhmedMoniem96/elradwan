import React from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';

export function PageShell({ children, sx }) {
  return (
    <Box
      sx={{
        px: (theme) => theme.customSpacing?.page?.x || { xs: 2, md: 3 },
        py: (theme) => theme.customSpacing?.page?.y || { xs: 2, md: 3 },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={(theme) => theme.customSpacing?.control || 1}
      sx={{ mb: (theme) => theme.customSpacing?.section || 2 }}
    >
      <Box>
        <Typography sx={(theme) => theme.typography.pageTitle}>{title}</Typography>
        {subtitle ? <Typography color="text.secondary" sx={(theme) => theme.typography.body}>{subtitle}</Typography> : null}
      </Box>
      {action || null}
    </Stack>
  );
}

export function SectionPanel({ title, subtitle, children, action, contentSx }) {
  return (
    <Card variant="panel" sx={{ mb: (theme) => theme.customSpacing?.section || 2 }}>
      <CardContent
        sx={{
          p: (theme) => theme.customSpacing?.card || 2,
          '&:last-child': { pb: (theme) => theme.customSpacing?.card || 2 },
          ...contentSx,
        }}
      >
        {(title || subtitle || action) ? (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={(theme) => theme.customSpacing?.control || 1}
            sx={{ mb: (theme) => theme.customSpacing?.control || 1 }}
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
