import React, { createContext, useState, useMemo, useContext, useEffect } from 'react';
import { alpha, createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import rtlPlugin from 'stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { useTranslation } from 'react-i18next';

const ThemeContext = createContext();

export const useThemeContext = () => useContext(ThemeContext);

// Create rtl cache
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
  key: 'muiltr',
});

export const ThemeContextProvider = ({ children }) => {
  const { i18n } = useTranslation();
  const [mode, setMode] = useState('light');
  
  const direction = i18n.language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.dir = direction;
  }, [direction]);

  const toggleColorMode = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = useMemo(
    () => {
      const isDark = mode === 'dark';
      const tokens = {
        spacing: {
          page: { x: { xs: 2, md: 3 }, y: { xs: 2, md: 3 } },
          section: 2,
          card: 2,
          control: 1,
        },
        radius: {
          card: 12,
          control: 10,
          chip: 999,
        },
        elevation: {
          none: 'none',
          card: isDark
            ? '0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.3)'
            : '0 1px 2px rgba(24, 39, 75, 0.08), 0 8px 20px rgba(24, 39, 75, 0.08)',
          hover: isDark
            ? '0 2px 4px rgba(0, 0, 0, 0.4), 0 12px 28px rgba(0, 0, 0, 0.34)'
            : '0 2px 4px rgba(24, 39, 75, 0.1), 0 10px 24px rgba(24, 39, 75, 0.12)',
        },
      };

      return createTheme({
        direction,
        spacing: 8,
        shadows: Array(25).fill('none'),
        shape: {
          borderRadius: tokens.radius.control,
          cardRadius: tokens.radius.card,
          inputRadius: tokens.radius.control,
          chipRadius: tokens.radius.chip,
        },
        palette: {
          mode,
          primary: {
            main: isDark ? '#7EA9FF' : '#1E5BB8',
            dark: isDark ? '#4E7CD2' : '#16458B',
            light: isDark ? '#AFC8FF' : '#5F8FDC',
            contrastText: '#FFFFFF',
          },
          secondary: {
            main: isDark ? '#B592FF' : '#6B46C1',
            contrastText: '#FFFFFF',
          },
          background: {
            default: isDark ? '#0B1220' : '#F7F8FA',
            paper: isDark ? '#121C2E' : '#FFFFFF',
          },
          text: {
            primary: isDark ? '#F7F9FF' : '#1D2433',
            secondary: isDark ? '#A8B3CB' : '#55607A',
          },
          divider: isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)',
        },
        typography: {
          fontFamily: direction === 'rtl' ? 'Arial, sans-serif' : 'Roboto, sans-serif',
          pageTitle: {
            fontSize: '1.75rem',
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
          },
          sectionTitle: {
            fontSize: '1.125rem',
            fontWeight: 600,
            lineHeight: 1.35,
          },
          body: {
            fontSize: '0.95rem',
            lineHeight: 1.6,
          },
          captionText: {
            fontSize: '0.8rem',
            fontWeight: 500,
            lineHeight: 1.4,
            letterSpacing: '0.01em',
          },
        },
        customSpacing: {
          page: tokens.spacing.page,
          section: tokens.spacing.section,
          card: tokens.spacing.card,
          control: tokens.spacing.control,
        },
        customElevation: {
          none: tokens.elevation.none,
          cardShadow: tokens.elevation.card,
          hoverShadow: tokens.elevation.hover,
          panelBorder: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)'}`,
        },
        customTokens: {
          ...tokens,
          contrast: {
            chartLabel: isDark ? '#E8EEFF' : '#2A3550',
            statusChipBorder: isDark ? alpha('#D5E2FF', 0.44) : alpha('#2A4B84', 0.22),
          },
        },
        components: {
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: 'none',
                borderRadius: tokens.radius.control,
                fontWeight: 600,
              },
              contained: {
                boxShadow: 'none',
                backgroundImage: 'none',
                backgroundColor: isDark ? '#7EA9FF' : '#1E5BB8',
                '&:hover': {
                  boxShadow: tokens.elevation.none,
                  filter: 'brightness(1.06)',
                },
              },
            },
          },
          MuiPaper: {
            defaultProps: {
              variant: 'outlined',
              elevation: 0,
              square: true,
            },
            styleOverrides: {
              root: {
                borderColor: isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)',
                backgroundImage: 'none',
                boxShadow: tokens.elevation.none,
              },
            },
          },
          MuiTextField: {
            defaultProps: {
              size: 'small',
              variant: 'outlined',
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: tokens.radius.control,
                backgroundColor: isDark ? alpha('#FFFFFF', 0.02) : alpha('#FFFFFF', 0.88),
              },
            },
          },
          MuiCard: {
            variants: [
              {
                props: { variant: 'panel' },
                style: {
                  borderRadius: tokens.radius.card,
                  border: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)'}`,
                  boxShadow: tokens.elevation.card,
                  transition: 'box-shadow 160ms ease',
                  background: isDark ? '#131D2F' : '#FFFFFF',
                  '&:hover': {
                    boxShadow: tokens.elevation.hover,
                  },
                },
              },
            ],
          },
          MuiTableContainer: {
            styleOverrides: {
              root: {
                borderRadius: tokens.radius.card,
                border: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)'}`,
                boxShadow: tokens.elevation.card,
                background: isDark ? '#131D2F' : '#FFFFFF',
                overflow: 'hidden',
              },
            },
          },
          MuiPopover: {
            styleOverrides: {
              paper: {
                borderRadius: tokens.radius.card,
                border: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)'}`,
                boxShadow: tokens.elevation.card,
              },
            },
          },
          MuiToolbar: {
            styleOverrides: {
              root: {
                minHeight: 70,
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: tokens.radius.chip,
                fontWeight: 500,
                border: `1px solid ${isDark ? alpha('#D5E2FF', 0.44) : alpha('#2A4B84', 0.22)}`,
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                borderRadius: tokens.radius.card,
                border: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.24)' : 'rgba(52, 79, 132, 0.16)'}`,
                boxShadow: tokens.elevation.card,
              },
            },
          },
          MuiListItemButton: {
            defaultProps: {
              dense: true,
            },
            styleOverrides: {
              root: {
                borderRadius: 10,
                paddingTop: tokens.spacing.control * 8,
                paddingBottom: tokens.spacing.control * 8,
                '&.Mui-selected': {
                  backgroundColor: isDark ? 'rgba(126, 169, 255, 0.2)' : 'rgba(30, 91, 184, 0.14)',
                },
              },
            },
          },
          MuiListItem: {
            styleOverrides: {
              root: {
                paddingTop: tokens.spacing.control * 8,
                paddingBottom: tokens.spacing.control * 8,
              },
            },
          },
          MuiTable: {
            defaultProps: {
              size: 'small',
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: {
                paddingTop: tokens.spacing.control * 8,
                paddingBottom: tokens.spacing.control * 8,
              },
              head: {
                fontWeight: 600,
                fontSize: '0.78rem',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: isDark ? '#BFCBE5' : '#4A5B7D',
              },
            },
          },
        },
      });
    },
    [mode, direction],
  );

  return (
    <ThemeContext.Provider value={{ toggleColorMode, mode }}>
      <CacheProvider value={direction === 'rtl' ? cacheRtl : cacheLtr}>
        <MuiThemeProvider theme={theme}>
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </ThemeContext.Provider>
  );
};
