import React from 'react';
import Paper from '@mui/material/Paper';

const Panel = React.forwardRef(function Panel(
  {
    dense = false,
    compact = false,
    sx,
    children,
    ...props
  },
  ref,
) {
  const spacingUnit = dense ? 1 : compact ? 1.5 : 2;

  return (
    <Paper
      ref={ref}
      variant="outlined"
      elevation={0}
      square
      sx={{
        p: spacingUnit,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: 'none',
        backgroundImage: 'none',
        ...sx,
      }}
      {...props}
    >
      {children}
    </Paper>
  );
});

export default Panel;
