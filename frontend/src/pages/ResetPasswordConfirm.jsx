import React, { useMemo, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Container,
  CssBaseline,
  Link,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useTranslation } from 'react-i18next';
import { formatFieldErrors, parseApiError } from '../utils/api';

export default function ResetPasswordConfirm() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { uid: uidParam, token: tokenParam } = useParams();
  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const initialUid = useMemo(() => searchParams.get('uid') || uidParam || '', [searchParams, uidParam]);
  const initialToken = useMemo(() => searchParams.get('token') || tokenParam || '', [searchParams, tokenParam]);
  const [email, setEmail] = useState(initialEmail);
  const [uid, setUid] = useState(initialUid);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if ((!email && !uid) || !token || !newPassword) {
      setError(t('reset_password_confirm_required_fields'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        token,
        new_password: newPassword,
      };
      if (email) {
        payload.email = email;
      }
      if (uid) {
        payload.uid = uid;
      }
      await axios.post('/api/v1/password-reset/confirm/', payload);
      setSuccess(true);
    } catch (requestError) {
      console.error('Password reset confirm failed', requestError);
      const parsedError = parseApiError(requestError);
      const fieldMessage = formatFieldErrors(parsedError.fieldErrors);
      const parsedMessage = fieldMessage || parsedError.message;
      setError(parsedMessage || t('reset_password_confirm_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
      <Paper elevation={6} sx={{ p: 4, mt: 8, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Avatar sx={{ m: 1, bgcolor: 'warning.main' }}>
            <LockResetIcon />
          </Avatar>
          <Typography component="h1" variant="h5">
            {t('reset_password')}
          </Typography>

          {!success ? (
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
                {t('reset_password_confirm_description')}
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <TextField
                margin="normal"
                fullWidth
                id="email"
                label={t('email')}
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                margin="normal"
                fullWidth
                id="uid"
                label={t('reset_password_uid')}
                name="uid"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                helperText={t('reset_password_uid_helper')}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                id="token"
                label={t('reset_password_token')}
                name="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                id="new-password"
                label={t('reset_password_new_password')}
                name="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isSubmitting}
                sx={{ mt: 3, mb: 2, py: 1.5 }}
              >
                {isSubmitting ? t('reset_password_confirm_submitting') : t('reset_password_confirm_submit')}
              </Button>
            </Box>
          ) : (
            <Box sx={{ mt: 2, textAlign: 'center', width: '100%' }}>
              <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
                {t('reset_password_confirm_success')}
              </Alert>
            </Box>
          )}

          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Link component={RouterLink} to="/login" variant="body2">
              {t('back_to_login')}
            </Link>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
