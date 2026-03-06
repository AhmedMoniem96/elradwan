import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Alert,
  Avatar,
  Button,
  CssBaseline,
  TextField,
  Box,
  Typography,
  Container,
  Link,
  Paper,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useTranslation } from 'react-i18next';
import { formatFieldErrors, parseApiError } from '../utils/api';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const [email, setEmail] = useState(initialEmail);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email) {
      setError(t('forgot_password_email_required'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await axios.post('/api/v1/password-reset/request/', { email });
      setSubmitted(true);
    } catch (requestError) {
      console.error('Password reset request failed', requestError);
      const parsedError = parseApiError(requestError);
      const fieldMessage = formatFieldErrors(parsedError.fieldErrors);
      const parsedMessage = fieldMessage || parsedError.message;
      setError(parsedMessage || t('forgot_password_request_error'));
    } finally {
      setIsSubmitting(false);
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
      <Paper elevation={0} sx={{ p: 4, mt: 1, borderRadius: (theme) => theme.shape.cardRadius || 12, border: (theme) => `1px solid ${theme.palette.divider}`, boxShadow: (theme) => theme.customElevation.cardShadow, backdropFilter: 'blur(14px)', background: (theme) => theme.palette.mode === 'dark' ? 'rgba(16, 26, 43, 0.82)' : 'rgba(255,255,255,0.86)' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'transparent', border: (theme) => `1px solid ${theme.palette.divider}`, color: 'primary.main' }}>
            <LockResetIcon />
          </Avatar>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            {t('reset_password')}
          </Typography>

          {!submitted ? (
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
                {t('forgot_password_description')}
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label={t('email')}
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isSubmitting}
                sx={{ mt: 3, mb: 2, py: 1.5 }}
              >
                {isSubmitting ? t('forgot_password_submitting') : t('send_reset_link')}
              </Button>
              <Box sx={{ textAlign: 'center' }}>
                <Link component={RouterLink} to="/login" variant="body2">
                  {t('back_to_login')}
                </Link>
              </Box>
            </Box>
          ) : (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
                {t('forgot_password_success')}
              </Alert>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {t('forgot_password_success_detail', { email })}
              </Typography>
              <Link component={RouterLink} to="/login" variant="body2">
                {t('back_to_login')}
              </Link>
            </Box>
          )}
        </Box>
      </Paper>
      </Container>
    </Box>
  );
}
