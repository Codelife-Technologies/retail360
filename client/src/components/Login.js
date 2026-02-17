import React, { useState } from 'react';
import { authAPI } from '../services/api';
import './Login.css';

function Login({ onLogin }) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(usernameOrEmail, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.seed();
      setLoading(false);
      alert(res.data?.message || 'Database seeded. Use admin / admin123 to sign in.');
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.error || 'Seed failed');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>RetailOS</h1>
        <h2>Sign In</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username or Email</label>
            <input
              type="text"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              required
              autoFocus
              placeholder="Enter username or email"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="login-seed-hint">
            First time?{' '}
            <button type="button" className="btn-link" onClick={handleSeed} disabled={loading}>
              Seed database
            </button>{' '}
            to create admin user (admin / admin123)
          </p>
        </form>
      </div>
    </div>
  );
}

export default Login;
