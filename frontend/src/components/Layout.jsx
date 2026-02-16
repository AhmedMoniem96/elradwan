import * as React from 'react';
import { styled } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import MuiDrawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import MuiAppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Container from '@mui/material/Container';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import NotificationsIcon from '@mui/icons-material/Notifications';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PeopleIcon from '@mui/icons-material/People';
import BarChartIcon from '@mui/icons-material/BarChart';
import LayersIcon from '@mui/icons-material/Layers';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AssessmentIcon from '@mui/icons-material/Assessment';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import LogoutIcon from '@mui/icons-material/Logout';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import SettingsIcon from '@mui/icons-material/Settings';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useThemeContext } from '../ThemeContext';
import { normalizeCountFromCollection } from '../utils/api';
import { formatDateTime } from '../utils/formatters';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { useSync } from '../sync/SyncContext';

const drawerWidth = 240;

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(['width', 'margin'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(['width', 'margin'], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
  ({ theme, open }) => ({
    '& .MuiDrawer-paper': {
      position: 'relative',
      whiteSpace: 'nowrap',
      width: drawerWidth,
      transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
      }),
      boxSizing: 'border-box',
      ...(!open && {
        overflowX: 'hidden',
        transition: theme.transitions.create('width', {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
        width: theme.spacing(7),
        [theme.breakpoints.up('sm')]: {
          width: theme.spacing(9),
        },
      }),
    },
  }),
);

export default function Layout() {
  const [open, setOpen] = React.useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toggleColorMode, mode } = useThemeContext();
  const {
    user,
    logout,
    can,
    availableBranches,
    availableDevices,
    setActiveBranchId,
    setActiveDeviceId,
  } = useAuth();
  const { outbox, failedEvents } = useSync();
  const [languageMenuAnchor, setLanguageMenuAnchor] = React.useState(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = React.useState(null);
  const [alertsMenuAnchor, setAlertsMenuAnchor] = React.useState(null);
  const [unreadAlerts, setUnreadAlerts] = React.useState(0);
  const [alertItems, setAlertItems] = React.useState([]);

  const refreshUnreadAlerts = React.useCallback(() => {
    axios
      .get('/api/v1/alerts/unread/')
      .then((res) => {
        const payload = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setAlertItems(payload);
        setUnreadAlerts(normalizeCountFromCollection(res.data));
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    refreshUnreadAlerts();
  }, [refreshUnreadAlerts]);

  const toggleDrawer = () => {
    setOpen(!open);
  };

  const handleLanguageMenu = (event) => {
    setLanguageMenuAnchor(event.currentTarget);
  };

  const handleLanguageMenuClose = () => {
    setLanguageMenuAnchor(null);
  };

  const handleSettingsMenuOpen = (event) => {
    setSettingsMenuAnchor(event.currentTarget);
  };

  const handleSettingsMenuClose = () => {
    setSettingsMenuAnchor(null);
  };

  const handleAlertsMenuOpen = (event) => {
    setAlertsMenuAnchor(event.currentTarget);
    refreshUnreadAlerts();
  };

  const handleAlertsMenuClose = () => {
    setAlertsMenuAnchor(null);
  };

  const markAlertRead = (alertId) => {
    setAlertItems((prev) => prev.filter((item) => item.id !== alertId));
    setUnreadAlerts((prev) => Math.max(prev - 1, 0));

    axios.post('/api/v1/alerts/mark-read/', { alert_ids: [alertId] })
      .then(() => refreshUnreadAlerts())
      .catch(() => refreshUnreadAlerts());
  };

  const markAllAlertsRead = () => {
    if (!alertItems.length) return;

    setAlertItems([]);
    setUnreadAlerts(0);

    axios.post('/api/v1/alerts/mark-read/', { alert_ids: alertItems.map((item) => item.id) })
      .then(() => refreshUnreadAlerts())
      .catch(() => refreshUnreadAlerts());
  };

  const getAlertSeverityColor = (severity) => {
    if (severity === 'critical') return 'error';
    if (severity === 'low') return 'warning';
    return 'default';
  };

  const getAlertMessage = (alert) => (
    alert.message
    || alert.description
    || t('inventory_alert_message', {
      product: alert.product_name || t('product'),
      warehouse: alert.warehouse_name || t('warehouse'),
      current: alert.current_quantity,
      threshold: alert.threshold_quantity,
    })
  );

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    handleLanguageMenuClose();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canManageRuntimeContext = can('device.read') || can('device.manage');

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="absolute"
        open={open}
        sx={{
          backdropFilter: 'blur(10px)',
          background: (theme) => `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
        }}
      >
        <Toolbar
          sx={{
            pr: 3,
          }}
        >
          <IconButton
            edge="start"
            color="inherit"
            aria-label="open drawer"
            onClick={toggleDrawer}
            sx={{
              marginRight: 4.5,
              ...(open && { display: 'none' }),
            }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            component="h1"
            variant="h6"
            color="inherit"
            noWrap
            sx={{ flexGrow: 1 }}
          >
            {t('app_title')}
          </Typography>
          
          <IconButton color="inherit" onClick={toggleColorMode}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>

          <IconButton color="inherit" onClick={handleLanguageMenu}>
            <TranslateIcon />
          </IconButton>
          <Menu
            anchorEl={languageMenuAnchor}
            open={Boolean(languageMenuAnchor)}
            onClose={handleLanguageMenuClose}
          >
            <MenuItem onClick={() => changeLanguage('en')}>{t('english')}</MenuItem>
            <MenuItem onClick={() => changeLanguage('ar')}>{t('arabic')}</MenuItem>
          </Menu>

          {canManageRuntimeContext && (
            <>
              <IconButton color="inherit" onClick={handleSettingsMenuOpen} title={t('settings')}>
                <SettingsIcon />
              </IconButton>
              <Menu
                anchorEl={settingsMenuAnchor}
                open={Boolean(settingsMenuAnchor)}
                onClose={handleSettingsMenuClose}
                sx={{ '& .MuiMenu-paper': { width: 320, p: 1 } }}
              >
                <Box sx={{ px: 1, pt: 1, pb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('runtime_context')}</Typography>
                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel id="active-branch-label">{t('active_branch')}</InputLabel>
                    <Select
                      labelId="active-branch-label"
                      label={t('active_branch')}
                      value={user?.branch_id ?? ''}
                      onChange={(event) => setActiveBranchId(event.target.value)}
                      disabled={availableBranches.length === 0}
                    >
                      {availableBranches.length === 0 && (
                        <MenuItem value="">{t('none')}</MenuItem>
                      )}
                      {availableBranches.map((branch) => (
                        <MenuItem key={branch.id} value={branch.id}>
                          {branch.name || branch.code || `${t('branches')} #${branch.id}`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel id="active-device-label">{t('active_device')}</InputLabel>
                    <Select
                      labelId="active-device-label"
                      label={t('active_device')}
                      value={user?.device_id ?? ''}
                      onChange={(event) => setActiveDeviceId(event.target.value)}
                      disabled={availableDevices.length === 0}
                    >
                      {availableDevices.length === 0 && (
                        <MenuItem value="">{t('none')}</MenuItem>
                      )}
                      {availableDevices.map((device) => (
                        <MenuItem key={device.id} value={device.id}>
                          {device.name || device.code || `${t('pos')} ${t('none')} #${device.id}`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Menu>
            </>
          )}

          <IconButton color="inherit" onClick={handleAlertsMenuOpen} title={t('inventory_unread_alerts')}>
            <Badge badgeContent={unreadAlerts} color="secondary">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <Menu
            anchorEl={alertsMenuAnchor}
            open={Boolean(alertsMenuAnchor)}
            onClose={handleAlertsMenuClose}
            sx={{ '& .MuiMenu-paper': { width: 420, maxWidth: '92vw' } }}
          >
            <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('inventory_unread_alerts')}</Typography>
              <Button size="small" disabled={!alertItems.length} onClick={markAllAlertsRead}>
                {t('inventory_mark_all_read')}
              </Button>
            </Box>
            <Divider />
            {alertItems.length === 0 ? (
              <MenuItem disabled>{t('inventory_no_unread_alerts')}</MenuItem>
            ) : (
              alertItems.slice(0, 8).map((alert) => (
                <MenuItem
                  key={alert.id}
                  onClick={() => markAlertRead(alert.id)}
                  sx={{
                    py: 1.25,
                    alignItems: 'flex-start',
                    whiteSpace: 'normal',
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Box sx={{ width: '100%', display: 'flex', gap: 1.5 }}>
                    <Box
                      sx={{
                        mt: 0.8,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: (theme) => (
                          alert.severity === 'critical'
                            ? theme.palette.error.main
                            : theme.palette.warning.main
                        ),
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {alert.title || alert.product_name || t('inventory_alert')}
                        </Typography>
                        <Chip size="small" color={getAlertSeverityColor(alert.severity)} label={t(`inventory_severity_${alert.severity}`, alert.severity || t('status'))} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        {getAlertMessage(alert)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(alert.created_at)}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))
            )}
          </Menu>

          <IconButton color="inherit" onClick={handleLogout} title={t('logout')}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        open={open}
        sx={{
          '& .MuiDrawer-paper': {
            borderRight: (theme) => `1px solid ${theme.palette.divider}`,
            backgroundImage: (theme) => `linear-gradient(180deg, ${theme.palette.background.paper} 0%, ${theme.palette.action.hover} 100%)`,
          },
        }}
      >
        <Toolbar
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            px: [1],
          }}
        >
          <IconButton onClick={toggleDrawer}>
            <ChevronLeftIcon />
          </IconButton>
        </Toolbar>
        <Divider />
        <List component="nav">
          <ListItemButton selected={location.pathname === '/'} onClick={() => navigate('/')}>
            <ListItemIcon>
              <DashboardIcon />
            </ListItemIcon>
            <ListItemText primary={t('dashboard')} />
          </ListItemButton>
          {can('sales.pos.access') && (
            <ListItemButton selected={location.pathname.startsWith('/pos')} onClick={() => navigate('/pos')}>
              <ListItemIcon>
                <ShoppingCartIcon />
              </ListItemIcon>
              <ListItemText primary={t('pos')} />
            </ListItemButton>
          )}
          {can('sales.customers.view') && (
            <ListItemButton selected={location.pathname.startsWith('/customers')} onClick={() => navigate('/customers')}>
              <ListItemIcon>
                <PeopleIcon />
              </ListItemIcon>
              <ListItemText primary={t('customers')} />
            </ListItemButton>
          )}
          {can('inventory.view') && (
            <>
              <ListItemButton selected={location.pathname.startsWith('/inventory')} onClick={() => navigate('/inventory')}>
                <ListItemIcon>
                  <BarChartIcon />
                </ListItemIcon>
                <ListItemText primary={t('inventory')} />
              </ListItemButton>
              <ListItemButton selected={location.pathname.startsWith('/suppliers')} onClick={() => navigate('/suppliers')}>
                <ListItemIcon>
                  <LocalShippingIcon />
                </ListItemIcon>
                <ListItemText primary={t('suppliers')} />
              </ListItemButton>
            </>
          )}
          {can('sales.dashboard.view') && (
            <ListItemButton selected={location.pathname.startsWith('/reports')} onClick={() => navigate('/reports')}>
              <ListItemIcon>
                <AssessmentIcon />
              </ListItemIcon>
              <ListItemText primary={t('reports')} />
            </ListItemButton>
          )}
          {can('admin.records.manage') && (
            <>
              <ListItemButton selected={location.pathname.startsWith('/branches')} onClick={() => navigate('/branches')}>
                <ListItemIcon>
                  <AccountTreeIcon />
                </ListItemIcon>
                <ListItemText primary={t('branches')} />
              </ListItemButton>
              <ListItemButton selected={location.pathname.startsWith('/warehouses')} onClick={() => navigate('/warehouses')}>
                <ListItemIcon>
                  <WarehouseIcon />
                </ListItemIcon>
                <ListItemText primary={t('warehouses')} />
              </ListItemButton>
              <ListItemButton selected={location.pathname.startsWith('/audit-logs')} onClick={() => navigate('/audit-logs')}>
                <ListItemIcon>
                  <ManageSearchIcon />
                </ListItemIcon>
                <ListItemText primary={t('audit_logs')} />
              </ListItemButton>
            </>
          )}
          {can('sync.view') && (
            <ListItemButton selected={location.pathname.startsWith('/sync')} onClick={() => navigate('/sync')}>
              <ListItemIcon>
                <Badge color={failedEvents.length > 0 ? 'error' : 'warning'} badgeContent={outbox.length}>
                  <LayersIcon />
                </Badge>
              </ListItemIcon>
              <ListItemText
                primary={t('sync_status')}
                secondary={failedEvents.length > 0 ? t('sync_nav_attention') : t('sync_nav_running')}
              />
            </ListItemButton>
          )}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{
          backgroundColor: (theme) => theme.palette.background.default,
          flexGrow: 1,
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <Toolbar />
        <Container maxWidth="lg" sx={{ mt: (theme) => theme.customSpacing?.pageY || 3, mb: (theme) => theme.customSpacing?.pageY || 3 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
