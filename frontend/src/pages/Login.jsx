import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import {
  Avatar,
  Button,
  CssBaseline,
  TextField,
  Box,
  Typography,
  Container,
  Link,
  Grid,
  Paper
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useTranslation } from 'react-i18next';


const LOGIN_ERROR_CODE_TRANSLATION_KEYS = {
  invalid_credentials: 'auth.invalid_credentials',
  invalid_login: 'auth.invalid_credentials',
  authentication_failed: 'auth.invalid_credentials',
  inactive_user: 'auth.inactive_user',
  user_inactive: 'auth.inactive_user',
  validation_error: 'auth.validation_error',
};

const resolveLoginErrorMessage = ({ t, code, message }) => {
  const translationKey = code ? LOGIN_ERROR_CODE_TRANSLATION_KEYS[code] : null;

  if (translationKey) {
    return t(translationKey);
  }

  if (message) {
    return message;
  }

  return t('auth.login_failed_fallback');
};

export default function Login() {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '' });
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({ username: '', password: '' });

    const result = await login(username, password);
    if (result?.ok) {
      navigate('/');
      return;
    }

    const nextFieldErrors = {
      username: result?.fieldErrors?.username || '',
      password: result?.fieldErrors?.password || '',
    };

    setFieldErrors(nextFieldErrors);

    const hasFieldErrors = Boolean(nextFieldErrors.username || nextFieldErrors.password);
    if (!hasFieldErrors) {
      setError(resolveLoginErrorMessage({
        t,
        code: result?.code,
        message: result?.message,
      }));
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: (theme) => theme.palette.mode === 'dark'
          ? 'radial-gradient(circle at top, rgba(78, 124, 210, 0.35) 0%, #0B1220 46%, #090D16 100%)'
          : 'radial-gradient(circle at top, rgba(30, 91, 184, 0.18) 0%, #EEF3FF 44%, #E8EEFF 100%)',
        py: 6,
      }}
    >
      <Container component="main" maxWidth="xs">
        <CssBaseline />
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 3,
            background: (theme) => theme.palette.mode === 'dark' ? 'rgba(16, 26, 43, 0.82)' : 'rgba(255, 255, 255, 0.86)',
            border: (theme) => `1px solid ${theme.palette.divider}`,
            boxShadow: (theme) => theme.customElevation.cardShadow,
            backdropFilter: 'blur(14px)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <Avatar
              sx={{
                m: 1,
                bgcolor: 'transparent',
                border: (theme) => `1px solid ${theme.palette.divider}`,
                color: 'primary.main',
              }}
            >
              <LockOutlinedIcon />
            </Avatar>
            <Typography component="h1" variant="h5" sx={{ color: 'text.primary', fontWeight: 700 }}>
              {t('sign_in')}
            </Typography>
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 2, width: '100%' }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label={t('username')}
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                error={Boolean(fieldErrors.username)}
                helperText={fieldErrors.username || ''}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'inherit',
                  },
                }}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label={t('password')}
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={Boolean(fieldErrors.password)}
                helperText={fieldErrors.password || ''}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    color: 'inherit',
                  },
                }}
              />
              {error && (
                <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                  {error}
                </Typography>
              )}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.5,
                  fontWeight: 700,
                }}
              >
                {t('sign_in')}
              </Button>
              <Grid container>
                <Grid item xs>
                  <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ color: 'primary.main' }}>
                    {t('forgot_password')}
                  </Link>
                </Grid>
                <Grid item>
                  <Link component={RouterLink} to="/register" variant="body2" sx={{ color: 'primary.main' }}>
                    {t('dont_have_account')}
                  </Link>
                </Grid>
              </Grid>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
