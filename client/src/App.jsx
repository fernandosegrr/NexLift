import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Routines from './pages/Routines';
import RoutineDetail from './pages/RoutineDetail';
import Workout from './pages/Workout';
import Import from './pages/Import';
import Progress from './pages/Progress';
import Settings from './pages/Settings';
import EditRoutine from './pages/EditRoutine';
import { ToastProvider } from './components/ui/Toast';
import './index.css';

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="routines" element={<Routines />} />
            <Route path="routines/:id" element={<RoutineDetail />} />
            <Route path="routines/:id/edit" element={<EditRoutine />} />
            <Route path="workout/:dayId" element={<Workout />} />
            <Route path="import" element={<Import />} />
            <Route path="progress" element={<Progress />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
