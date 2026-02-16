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
          pageX: { xs: 2, md: 3 },
          pageY: { xs: 2, md: 3 },
          sectionGap: 2,
          panelPadding: 2.5,
          panelPaddingDense: 2,
        },
        radius: {
          panel: 16,
          control: 10,
          chip: 999,
        },
        elevation: {
          panel: isDark
            ? '0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.3)'
            : '0 1px 2px rgba(24, 39, 75, 0.08), 0 8px 20px rgba(24, 39, 75, 0.08)',
        },
      };

      return createTheme({
        direction,
        spacing: 8,
        shape: {
          borderRadius: tokens.radius.control,
          cardRadius: tokens.radius.panel,
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
            default: isDark ? '#12161F' : '#F4F6FB',
            paper: isDark ? '#1A2130' : '#FFFFFF',
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
          ...tokens.spacing,
          cardPadding: tokens.spacing.panelPadding,
        },
        customElevation: {
          cardShadow: tokens.elevation.panel,
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
                borderRadius: 10,
                fontWeight: 600,
              },
              contained: {
                boxShadow: 'none',
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
              },
            },
          },
          MuiCard: {
            variants: [
              {
                props: { variant: 'panel' },
                style: {
                  borderRadius: tokens.radius.panel,
                  border: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.22)' : 'rgba(52, 79, 132, 0.18)'}`,
                  boxShadow: tokens.elevation.panel,
                },
              },
            ],
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
                borderRadius: 14,
                border: `1px solid ${isDark ? 'rgba(187, 201, 230, 0.24)' : 'rgba(52, 79, 132, 0.16)'}`,
              },
            },
          },
          MuiListItemButton: {
            styleOverrides: {
              root: {
                borderRadius: 10,
                '&.Mui-selected': {
                  backgroundColor: isDark ? 'rgba(126, 169, 255, 0.2)' : 'rgba(30, 91, 184, 0.14)',
                },
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
                paddingTop: 10,
                paddingBottom: 10,
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
