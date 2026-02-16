import React from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';

export function PageShell({ children, sx }) {
  return (
    <Box
      sx={{
        px: (theme) => theme.customSpacing?.pageX || { xs: 2, md: 3 },
        py: (theme) => theme.customSpacing?.pageY || { xs: 2, md: 3 },
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
      spacing={1.5}
      sx={{ mb: 2.5 }}
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
    <Card variant="panel" sx={{ mb: (theme) => theme.customSpacing?.sectionGap || 2 }}>
      <CardContent
        sx={{
          p: (theme) => theme.customSpacing?.panelPadding || 2.5,
          '&:last-child': { pb: (theme) => theme.customSpacing?.panelPadding || 2.5 },
          ...contentSx,
        }}
      >
        {(title || subtitle || action) ? (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1.25}
            sx={{ mb: 2 }}
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
