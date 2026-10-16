import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
// Eager: solo login (sin sesión) — el Dashboard también es lazy para no
// cargar heatmap/logros en el chunk inicial de quien aún no autenticó.
import Login from './pages/Login';
import { ToastProvider } from './components/ui/Toast';
import './index.css';

// Lazy: páginas de la app (y Dashboard) se cargan al navegar
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Routines = lazy(() => import('./pages/Routines'));
const RoutineDetail = lazy(() => import('./pages/RoutineDetail'));
const Workout = lazy(() => import('./pages/Workout'));
const Import = lazy(() => import('./pages/Import'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));
const EditRoutine = lazy(() => import('./pages/EditRoutine'));
const EditSession = lazy(() => import('./pages/EditSession'));
const BodyTracking = lazy(() => import('./pages/BodyTracking'));
const ExportReport = lazy(() => import('./pages/ExportReport'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Profile = lazy(() => import('./pages/Profile'));
const NewGoal = lazy(() => import('./pages/NewGoal'));
const AiRoutineSetup = lazy(() => import('./pages/AiRoutineSetup'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center" role="status" aria-label="Cargando">
      <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Public Route wrapper (redirect to home if already logged in)
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="routines" element={<Routines />} />
        <Route path="routines/:id" element={<RoutineDetail />} />
        <Route path="routines/:id/edit" element={<EditRoutine />} />
        <Route path="workout/:dayId" element={<Workout />} />
        <Route path="import" element={<Import />} />
        <Route path="progress" element={<Progress />} />
        <Route path="settings" element={<Settings />} />
        <Route path="session/:logId/edit" element={<EditSession />} />
        <Route path="body" element={<BodyTracking />} />
        <Route path="export" element={<ExportReport />} />
        <Route path="profile" element={<Profile />} />
        <Route path="goals/new" element={<NewGoal />} />
        <Route path="ai-routine/setup" element={<AiRoutineSetup />} />
      </Route>

      {/* Catch-all: redirige URLs desconocidas al inicio */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
