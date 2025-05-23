import { useNavigate } from 'react-router-dom';

export default function useAuth() {
  const navigate = useNavigate();

  async function login(credentials) {
    const res = await fetch('/erp/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      navigate('/');
    } else {
      alert(data.message);
    }
  }

  return { login };
}