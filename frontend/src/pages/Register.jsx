import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
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
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import { useTranslation } from 'react-i18next';
import { formatFieldErrors, parseApiError } from '../utils/api';

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await axios.post('/api/v1/register/', formData);
      navigate('/login');
    } catch (err) {
      console.error(err);
      const parsedError = parseApiError(err);
      const fieldMessage = formatFieldErrors(parsedError.fieldErrors);
      const parsedMessage = fieldMessage || parsedError.message;
      setError(parsedMessage || t('auth.request_failed_fallback'));
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at top, #1f1c2c 0%, #110d1f 45%, #0b0b12 100%)',
        py: 6,
      }}
    >
      <Container component="main" maxWidth="xs">
        <CssBaseline />
        <Paper
          elevation={10}
          sx={{
            p: 4,
            borderRadius: 3,
            background: 'rgba(14, 14, 20, 0.88)',
            border: '1px solid rgba(212, 175, 55, 0.35)',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(8px)',
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
                border: '1px solid rgba(212, 175, 55, 0.7)',
                color: '#f5d88c',
              }}
            >
              <PersonAddOutlinedIcon />
            </Avatar>
            <Typography component="h1" variant="h5" sx={{ color: '#f5d88c' }}>
              {t('create_account')}
            </Typography>
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    autoComplete="given-name"
                    name="first_name"
                    required
                    fullWidth
                    id="firstName"
                    label={t('first_name')}
                    autoFocus
                    value={formData.first_name}
                    onChange={handleChange}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#f5f5f5',
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    required
                    fullWidth
                    id="lastName"
                    label={t('last_name')}
                    name="last_name"
                    autoComplete="family-name"
                    value={formData.last_name}
                    onChange={handleChange}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#f5f5f5',
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    required
                    fullWidth
                    id="username"
                    label={t('username')}
                    name="username"
                    autoComplete="username"
                    value={formData.username}
                    onChange={handleChange}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#f5f5f5',
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    required
                    fullWidth
                    id="email"
                    label={t('email')}
                    name="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#f5f5f5',
                      },
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    required
                    fullWidth
                    name="password"
                    label={t('password')}
                    type="password"
                    id="password"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={handleChange}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        color: '#f5f5f5',
                      },
                    }}
                  />
                </Grid>
              </Grid>
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
                  background: 'linear-gradient(120deg, #d4af37 0%, #f7e29c 100%)',
                  color: '#1a1a1a',
                  fontWeight: 600,
                  '&:hover': {
                    background: 'linear-gradient(120deg, #c89f2d 0%, #f4d87c 100%)',
                  },
                }}
              >
                {t('register')}
              </Button>
              <Grid container justifyContent="flex-end">
                <Grid item>
                  <Link component={RouterLink} to="/login" variant="body2" sx={{ color: '#f5d88c' }}>
                    {t('already_have_account')}
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
