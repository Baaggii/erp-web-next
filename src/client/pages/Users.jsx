// File: src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers]         = useState([]);
  const [newUser, setNewUser]     = useState({
    empid:'', name:'', company:'', role:'user', password:''
  });
  const [myProfile, setMyProfile] = useState({
    name:'', company:'', oldPassword:'', password:''
  });
  const [msg, setMsg]             = useState('');

  // load on mount
  useEffect(() => {
    fetch('/erp/api/users/me', { credentials:'include' })
      .then(r=>r.json())
      .then(data => {
        setMyProfile({ name:data.name, company:data.company, oldPassword:'', password:'' });
      });
    if (isAdmin) {
      fetch('/erp/api/users', { credentials:'include' })
        .then(r=>r.json())
        .then(setUsers)
        .catch(()=>setMsg('Users fetch failed'));
    }
  }, [isAdmin]);

  // create
  const createUser = async e => {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/erp/api/users', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(newUser)
    });
    const json = await res.json();
    if (!res.ok) {
      return setMsg(`Error ${res.status}: ${json.message}`);
    }
    setUsers(u=>[...u,json.user]);
    setNewUser({ empid:'', name:'', company:'', role:'user', password:'' });
    setMsg('User created');
  };

  // update
  const updateUser = async (id, changes) => {
    setMsg('');
    const res = await fetch(`/erp/api/users/${id}`, {
      method:'PUT',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(changes)
    });
    const json = await res.json();
    if (!res.ok) {
      return setMsg(`Error ${res.status}: ${json.message}`);
    }
    setUsers(u=>u.map(x=> x.id===id ? { ...x, ...changes } : x));
    if (id===user.id) {
      setMyProfile(p=>({ ...p, ...changes }));
    }
    setMsg(json.message);
  };

  // delete
  const deleteUser = async id => {
    if (!window.confirm('Delete this user?')) return;
    const res = await fetch(`/erp/api/users/${id}`, {
      method:'DELETE',
      credentials:'include'
    });
    if (res.ok) {
      setUsers(u=>u.filter(x=>x.id!==id));
      setMsg('Deleted');
    }
  };

  return (
    <div style={{ padding:20, maxWidth:800, margin:'auto' }}>
      <h1>User Management</h1>
      {msg && <p style={{ color:'green' }}>{msg}</p>}

      {isAdmin && (
        <section>
          <h2>Create User</h2>
          <form onSubmit={createUser}>
            <input
              placeholder="EmpID"
              value={newUser.empid}
              onChange={e=>setNewUser({...newUser, empid:e.target.value})}
              required
            /><br/>
            <input
              placeholder="Name"
              value={newUser.name}
              onChange={e=>setNewUser({...newUser, name:e.target.value})}
            /><br/>
            <input
              type="password"
              placeholder="Password"
              value={newUser.password}
              onChange={e=>setNewUser({...newUser, password:e.target.value})}
              required
            /><br/>
            <input
              placeholder="Company"
              value={newUser.company}
              onChange={e=>setNewUser({...newUser, company:e.target.value})}
            /><br/>
            <select
              value={newUser.role}
              onChange={e=>setNewUser({...newUser, role:e.target.value})}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select><br/>
            <button type="submit">Create</button>
          </form>
        </section>
      )}

      {isAdmin && (
        <section>
          <h2>All Users</h2>
          <table border={1} cellPadding={5} cellSpacing={0}>
            <thead>
              <tr>
                <th>ID</th><th>EmpID</th><th>Name</th><th>Company</th><th>Role</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.empid}</td>
                  <td>
                    <input
                      value={u.name}
                      onChange={e=>updateUser(u.id,{name:e.target.value})}
                    />
                  </td>
                  <td>
                    <input
                      value={u.company}
                      onChange={e=>updateUser(u.id,{company:e.target.value})}
                    />
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e=>updateUser(u.id,{role:e.target.value})}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={()=>deleteUser(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Change Your Password</h2>
        <form onSubmit={e=>{
          e.preventDefault();
          updateUser(user.id, {
            oldPassword:myProfile.oldPassword,
            password:myProfile.password
          });
        }}>
          <input
            type="password"
            placeholder="Old Password"
            value={myProfile.oldPassword}
            onChange={e=>setMyProfile({...myProfile, oldPassword:e.target.value})}
            required
          /><br/>
          <input
            type="password"
            placeholder="New Password"
            value={myProfile.password}
            onChange={e=>setMyProfile({...myProfile, password:e.target.value})}
            required
          /><br/>
          <button type="submit">Update Password</button>
        </form>
      </section>
    </div>
  );
}
