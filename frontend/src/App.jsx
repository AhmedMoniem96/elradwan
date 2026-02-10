import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import Sync from './pages/Sync';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import { ThemeContextProvider } from './ThemeContext';
import { AuthProvider, useAuth } from './AuthContext';
import { SyncProvider } from './sync/SyncContext';

const ProtectedRoute = () => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
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
              <Route path="pos" element={<POS />} />
              <Route path="customers" element={<Customers />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="sync" element={<Sync />} />
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
