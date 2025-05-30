import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function UserProfile() {
  const { user } = useContext(AuthContext);
  return <div>Logged in as: {user.email}</div>;
}