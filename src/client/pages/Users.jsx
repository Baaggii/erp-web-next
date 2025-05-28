import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { user } = useAuth();
  const [allUsers, setAllUsers]     = useState([]);
  const [myProfile, setMyProfile]   = useState({ name:'', company:'', password:'' });
  const [newUser, setNewUser]       = useState({ empid:'', email:'', name:'', password:'', role:'user' });
  const [msg, setMsg]               = useState('');

  // On mount: load your profile + all users (if admin)
  useEffect(() => {
    fetch('/erp/api/users/me',{ credentials:'include' })
      .then(r=>r.json())
      .then(data => setMyProfile({ name:data.name, company:data.company, password:'' }));
    if (user.role==='admin') {
      fetch('/erp/api/users',{ credentials:'include' })
        .then(r=>r.json())
        .then(setAllUsers);
    }
  }, [user]);

  // Create new
  const create = async e => { /* POST /erp/api/users ... */ };

  // Update (admin edits or self)
  const update = async (id, changes) => { /* PUT /erp/api/users/:id */ };

  // Change password
  const changePassword = async e => { /* PUT /erp/api/users/:id/password */ };

  // Delete
  const remove = async id => { /* DELETE /erp/api/users/:id */ };

  return (
    <div>
      <h1>User Management</h1>
      {user.role==='admin' && (
        <>
          <h2>Create User</h2>
          <form onSubmit={create}>
            {/* fields: empid, name, password, role */}
          </form>

          <h2>All Users</h2>
          <table>…</table>
        </>
      )}

      <h2>Your Profile</h2>
      <form onSubmit={changePassword}>…</form>
    </div>
  );
}
