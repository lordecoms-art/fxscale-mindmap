import { useState } from 'react';
import { supabase } from './lib/supabase';

export default function Login({ onAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: authError } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
      }
    } catch {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0A0A0F',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#1a1a2e', borderRadius: 16, padding: 36, width: 380,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18, color: '#000',
          }}>FX</div>
          <h2 style={{
            fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 20, color: '#fff', margin: 0,
          }}>FXSCALE <span style={{ color: '#A78BFA' }}>Mindmap</span></h2>
          <p style={{
            fontFamily: "'Outfit', sans-serif", fontSize: 13, color: '#666', marginTop: 8,
          }}>{isSignUp ? 'Creer un compte' : 'Connexion'}</p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            color: '#FF6B6B', fontSize: 13, fontFamily: "'Outfit', sans-serif",
          }}>{error}</div>
        )}

        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          required
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 12, boxSizing: 'border-box',
          }}
        />

        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mot de passe"
          required
          minLength={6}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 20, boxSizing: 'border-box',
          }}
        />

        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '12px', borderRadius: 8, border: 'none',
          background: loading ? '#333' : 'linear-gradient(135deg, #4ECDC4, #A78BFA)',
          color: loading ? '#666' : '#000', fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          fontFamily: "'Space Mono', monospace", fontSize: 14, marginBottom: 16,
        }}>
          {loading ? 'Chargement...' : (isSignUp ? 'Creer le compte' : 'Se connecter')}
        </button>

        <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} style={{
          width: '100%', padding: '8px', borderRadius: 8,
          border: '1px solid #333', background: 'transparent',
          color: '#666', cursor: 'pointer',
          fontFamily: "'Outfit', sans-serif", fontSize: 12,
        }}>
          {isSignUp ? 'Deja un compte ? Se connecter' : 'Creer un compte'}
        </button>
      </form>
    </div>
  );
}
