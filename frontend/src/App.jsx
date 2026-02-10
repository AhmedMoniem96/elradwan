import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Sync from './pages/Sync';
import AuditLogs from './pages/AuditLogs';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import { ThemeContextProvider } from './ThemeContext';
import { AuthProvider, useAuth } from './AuthContext';
import { SyncProvider } from './sync/SyncContext';

const ProtectedRoute = ({ capability }) => {
  const { user, can } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (capability && !can(capability)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};

function RoutedApp() {
  const { user } = useAuth();

  return (
    <SyncProvider
      runtimeContext={{
        userId: user?.id,
        branchId: user?.branch_id,
        deviceId: user?.device_id,
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route element={<ProtectedRoute capability="sales.pos.access" />}>
                <Route path="pos" element={<POS />} />
              </Route>
              <Route element={<ProtectedRoute capability="sales.customers.view" />}>
                <Route path="customers" element={<Customers />} />
              </Route>
              <Route element={<ProtectedRoute capability="inventory.view" />}>
                <Route path="inventory" element={<Inventory />} />
              </Route>
              <Route element={<ProtectedRoute capability="sync.view" />}>
                <Route path="sync" element={<Sync />} />
              </Route>
              <Route element={<ProtectedRoute capability="sales.dashboard.view" />}>
                <Route path="reports" element={<Reports />} />
              </Route>
              <Route element={<ProtectedRoute capability="admin.records.manage" />}>
                <Route path="audit-logs" element={<AuditLogs />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </SyncProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeContextProvider>
        <RoutedApp />
      </ThemeContextProvider>
    </AuthProvider>
  );
}

export default App;
