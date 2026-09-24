import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      const code = err.response?.data?.code;
      if (code === 'TOKEN_INVALID' || code === 'UNAUTHORIZED' || code === 'TOKEN_REVOKED') {
        localStorage.removeItem('pt_token');
        localStorage.removeItem('pt_user');
        window.location.reload();
      }
    }
    return Promise.reject(err);
  }
);

export default client;
