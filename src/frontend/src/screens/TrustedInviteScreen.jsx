import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'trusted_invite_token';

export default function TrustedInviteScreen() {
  const [searchParams] = useSearchParams();
  const navigate      = useNavigate();
  const { user, loading } = useAuth();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  useEffect(() => {
    if (!loading) {
      navigate(user ? '/safety-plan' : '/login', { replace: true });
    }
  }, [loading, user, navigate]);

  return null;
}
