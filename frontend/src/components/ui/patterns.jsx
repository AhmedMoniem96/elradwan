import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Table,
  TableContainer,
  Typography,
} from '@mui/material';

export function SharedTable({ children, stickyHeader = true, sx, tableSx, ...props }) {
  return (
    <TableContainer
      component={Card}
      variant="panel"
      sx={{
        borderRadius: (theme) => theme.shape.cardRadius || 2,
        ...sx,
      }}
    >
      <Table
        stickyHeader={stickyHeader}
        size="small"
        sx={{
          '& .MuiTableRow-root': {
            height: 50,
          },
          '& .MuiTableCell-head:last-of-type': {
            textAlign: 'right',
          },
          ...tableSx,
        }}
        {...props}
      >
        {children}
      </Table>
    </TableContainer>
  );
}

export function TableActionCell({ children, sx, ...props }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 1,
        minWidth: 170,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}

export function SharedFormSection({ title, caption, children, dense = false }) {
  return (
    <Box>
      {(title || caption) ? (
        <Box sx={{ mb: dense ? 1 : 1.5 }}>
          {title ? <Typography sx={(theme) => theme.typography.sectionTitle}>{title}</Typography> : null}
          {caption ? <Typography sx={(theme) => theme.typography.captionText} color="text.secondary">{caption}</Typography> : null}
        </Box>
      ) : null}
      <Stack spacing={dense ? 1.25 : 1.5}>{children}</Stack>
    </Box>
  );
}

export function SharedFormLayout({ children, actions, sx }) {
  return (
    <Card variant="panel" sx={sx}>
      <CardContent
        sx={{
          p: (theme) => theme.customSpacing?.card || 2,
          '&:last-child': { pb: (theme) => theme.customSpacing?.card || 2 },
        }}
      >
        <Stack spacing={2}>
          {children}
          {actions ? (
            <Box
              sx={{
                pt: 1,
                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
              }}
            >
              <Stack direction="row" justifyContent="flex-end" spacing={1}>
                {actions}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
