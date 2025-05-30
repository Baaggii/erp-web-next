[⚠️ Suspicious Content] import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import MainUser from './pages/MainUser.jsx';
import MainUserSettings from './pages/MainUserSettings.jsx';
import LicenseConfig from './pages/LicenseConfig.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Forms from './pages/Forms.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/main-user" element={<MainUser />} />
            <Route path="/main-user/settings" element={<MainUserSettings />} />
            <Route path="/main-user/licenses" element={<LicenseConfig />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/forms" element={<Forms />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<Users />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthContextProvider>
  );
}