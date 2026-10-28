import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'trusted_invite_token';

export default function TrustedInviteScreen() {
  const [searchParams] = useSearchParams();
  const navigate      = useNavigate();
  const { user, loading } = useAuth();
  const token = searchParams.get('token');

  // Save token immediately — before auth resolves
  useEffect(() => {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
      window.dispatchEvent(new Event('trusted-invite-token-set'));
    }
  }, [token]);

  // Navigate once auth state is known
  useEffect(() => {
    if (!loading) {
      navigate(user ? '/dashboard' : '/login', { replace: true });
    }
  }, [loading, user, navigate]);

  return null;
}
