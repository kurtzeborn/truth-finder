import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LandingPage } from './pages/LandingPage';
import { PlayerPage } from './pages/PlayerPage';
import { DashboardPage } from './pages/DashboardPage';
import { GameControlPage } from './pages/GameControlPage';
import { GameKeepersPage } from './pages/GameKeepersPage';
import { MockAuthPage, MockLogoutPage } from './pages/MockAuthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 5,
      retry: 2,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/play" element={<PlayerPage />} />
          <Route path="/manage" element={<DashboardPage />} />
          <Route path="/manage/game/:gameId" element={<GameControlPage />} />
          <Route path="/manage/keepers" element={<GameKeepersPage />} />
          {/* Mock auth routes for local development */}
          <Route path="/.auth/login/aad" element={<MockAuthPage />} />
          <Route path="/.auth/logout" element={<MockLogoutPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
