// File: src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth }                    from '../context/AuthContext.jsx';

export default function Users() {
  const { user }       = useAuth();
  const isAdmin        = user?.role === 'admin';
  const [users, setUsers]           = useState([]);
  const [newUser, setNewUser]       = useState({
    empid:'', email:'', password:'', name:'', company:'', role:'user'
  });
  const [profilePwd, setProfilePwd] = useState({
    oldPassword:'', newPassword:'', confirmPassword:''
  });
  const [message, setMessage]       = useState('');

  useEffect(() => {
    if (isAdmin) {
      fetch('/erp/api/users', { credentials:'include' })
        .then(r=>r.json()).then(setUsers);
    }
  }, [isAdmin]);

  // Admin: create user
  const handleCreate = async e => {
    e.preventDefault();
    setMessage('');
    const res = await fetch('/erp/api/users', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type':'application/json' },
      body:        JSON.stringify(newUser)
    });
    const json = await res.json();
    setMessage(json.message || (res.ok?'User created':'Failed'));
    if (res.ok) {
      setUsers(u=>[...u, json.user]);
      setNewUser({ empid:'',email:'',password:'',name:'',company:'',role:'user' });
    }
  };

  // Update any user (admin) or self (password only)
  const handleUpdate = async (id, changes) => {
    setMessage('');
    const res  = await fetch(`/erp/api/users/${id}`, {
      method:      'PUT',
      credentials: 'include',
      headers:     { 'Content-Type':'application/json' },
      body:        JSON.stringify(changes)
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(`Error ${res.status}: ${json.message||json.error}`);
      return;
    }
    setMessage(json.message || 'Updated');
    if (isAdmin) {
      setUsers(u=>u.map(x=>x.id===id?{...x,...changes}:x));
    }
  };

  // Delete (admin only)
  const handleDelete = async id => {
    if (!window.confirm('Delete?')) return;
    await fetch(`/erp/api/users/${id}`, { method:'DELETE', credentials:'include' });
    setUsers(u=>u.filter(x=>x.id!==id));
    setMessage('Deleted');
  };

  return (
    <div style={{ padding:20, maxWidth:800, margin:'auto' }}>
      <h1>User Management</h1>
      {message && <p style={{ color:'green' }}>{message}</p>}

      {isAdmin && (
      <>
        <section>
          <h2>Create New User</h2>
          <form onSubmit={handleCreate}>
            <input
              placeholder="Employee ID"
              value={newUser.empid}
              onChange={e=>setNewUser({...newUser,empid:e.target.value})}
              required
            /><br/>
            <input
              placeholder="Email"
              value={newUser.email}
              onChange={e=>setNewUser({...newUser,email:e.target.value})}
              required
            /><br/>
            <input
              type="password"
              placeholder="Password"
              value={newUser.password}
              onChange={e=>setNewUser({...newUser,password:e.target.value})}
              required
            /><br/>
            <input
              placeholder="Name"
              value={newUser.name}
              onChange={e=>setNewUser({...newUser,name:e.target.value})}
            /><br/>
            <input
              placeholder="Company"
              value={newUser.company}
              onChange={e=>setNewUser({...newUser,company:e.target.value})}
            /><br/>
            <select
              value={newUser.role}
              onChange={e=>setNewUser({...newUser,role:e.target.value})}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select><br/>
            <button type="submit">Create</button>
          </form>
        </section>

        <section>
          <h2>All Users</h2>
          <table border={1} cellPadding={5} cellSpacing={0}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Emp ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Company</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.empid}</td>
                  <td>{u.email}</td>
                  <td>
                    <input
                      value={u.name}
                      onChange={e=>handleUpdate(u.id,{name:e.target.value})}
                    />
                  </td>
                  <td>
                    <input
                      value={u.company}
                      onChange={e=>handleUpdate(u.id,{company:e.target.value})}
                    />
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e=>handleUpdate(u.id,{role:e.target.value})}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={()=>handleDelete(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
      )}

      <section>
        <h2>Your Profile</h2>
        {isAdmin ? (
          /* Admin can change name/email/company too – reuse handleUpdate */
          <form onSubmit={e=>{e.preventDefault(); handleUpdate(user.id,{})}}>
            {/* Render inputs for name, email, company if desired */}
          </form>
        ) : (
          /* Non-admins only change password */
          <form onSubmit={e=>{
            e.preventDefault();
            handleUpdate(user.id, profilePwd);
          }}>
            <input
              type="password"
              placeholder="Old Password"
              value={profilePwd.oldPassword}
              onChange={e=>setProfilePwd({...profilePwd,oldPassword:e.target.value})}
              required
            /><br/>
            <input
              type="password"
              placeholder="New Password"
              value={profilePwd.newPassword}
              onChange={e=>setProfilePwd({...profilePwd,newPassword:e.target.value})}
              required
            /><br/>
            <input
              type="password"
              placeholder="Confirm New Password"
              value={profilePwd.confirmPassword}
              onChange={e=>setProfilePwd({...profilePwd,confirmPassword:e.target.value})}
              required
            /><br/>
            <button type="submit">Change Password</button>
          </form>
        )}
      </section>
    </div>
  );
}
