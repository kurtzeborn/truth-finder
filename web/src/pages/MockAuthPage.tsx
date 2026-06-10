import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Mock auth page for local development
// In production, SWA handles /.auth/login/aad natively
export function MockAuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('scott@kurtzeborn.org');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const principal = JSON.stringify({
      userId: 'mock-user-id',
      userDetails: email,
      identityProvider: 'aad',
      userRoles: ['authenticated', 'anonymous'],
    });
    localStorage.setItem('mockAuthPrincipal', principal);
    navigate('/manage');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4">
        <h2 className="text-2xl font-bold text-center">Mock Sign In</h2>
        <p className="text-gray-400 text-center text-sm">Local development only</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full p-3 rounded bg-gray-800 border border-gray-700"
        />
        <button type="submit" className="w-full p-3 rounded bg-blue-600 hover:bg-blue-700 font-semibold">
          Sign In
        </button>
      </form>
    </div>
  );
}

export function MockLogoutPage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('mockAuthPrincipal');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Sign Out</h2>
        <button onClick={handleLogout} className="px-6 py-3 rounded bg-red-600 hover:bg-red-700 font-semibold">
          Confirm Sign Out
        </button>
      </div>
    </div>
  );
}
