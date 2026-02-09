import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.tsx';
import ErrorBoundary from './components/common/ErrorBoundary.tsx';
import ProtectedRoute from './components/common/ProtectedRoute.tsx';
import Layout from './components/layout/Layout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import ClientsPage from './pages/ClientsPage.tsx';
import AnalyticsPage from './pages/AnalyticsPage.tsx';
import ConfigPage from './pages/ConfigPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import AuditPage from './pages/AuditPage.tsx';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit" element={<AuditPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}
