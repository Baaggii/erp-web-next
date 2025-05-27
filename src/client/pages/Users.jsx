// File: src/client/pages/Users.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function UsersPage() {
  const { user }   = useAuth();
  const isAdmin    = user?.role === 'admin';
  const [allUsers, setAllUsers] = useState([]);
  const [me, setMe]             = useState({});
  const [newUser, setNewUser]   = useState({
    empid:'', name:'', company:'', role:'user', password:''
  });
  const [msg, setMsg] = useState('');

  // load user + allUsers
  useEffect(() => {
    fetch('/erp/api/users/me', { credentials:'include' })
      .then(r => r.json())
      .then(setMe);

    if (isAdmin) {
      fetch('/erp/api/users', { credentials:'include' })
        .then(r => r.json())
        .then(setAllUsers);
    }
  }, [isAdmin]);

  const api = (url, opts) => fetch(url, {
    credentials:'include', headers:{'Content-Type':'application/json'}, ...opts
  }).then(async r => {
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.message||j.error||r.statusText);
    return j;
  });

  // 1) Create
  const handleCreate = e => {
    e.preventDefault();
    setMsg('');
    api('/erp/api/users', {
      method:'POST',
      body: JSON.stringify(newUser)
    })
    .then(({user:u, message}) => {
      setAllUsers(a => [...a, u]);
      setMsg(message);
    }).catch(e => setMsg(e.message));
  };

  // 2) Update (name/company/role or password)
  const handleUpdate = (empid, changes) => {
    setMsg('');
    api(`/erp/api/users/${empid}`, {
      method:'PUT', body: JSON.stringify(changes)
    })
    .then(j => setMsg(j.message))
    .catch(e => setMsg(e.message));
  };

  // 3) Delete
  const handleDelete = empid => {
    if (!window.confirm('Delete?')) return;
    setMsg('');
    api(`/erp/api/users/${empid}`, { method:'DELETE' })
      .then(j => {
        setAllUsers(a => a.filter(u => u.empid !== empid));
        setMsg(j.message);
      }).catch(e => setMsg(e.message));
  };

  return (
    <div style={{ padding:20, maxWidth:800, margin:'auto' }}>
      <h1>User Management</h1>
      {msg && <p style={{ color:'green' }}>{msg}</p>}

      {isAdmin && (
        <>
          <section>
            <h2>Create User</h2>
            <form onSubmit={handleCreate}>
              <input placeholder="EmpID"    value={newUser.empid}
                     onChange={e=>setNewUser({...newUser,empid:e.target.value})} required /><br/>
              <input placeholder="Name"     value={newUser.name}
                     onChange={e=>setNewUser({...newUser,name:e.target.value})} required /><br/>
              <input placeholder="Company"  value={newUser.company}
                     onChange={e=>setNewUser({...newUser,company:e.target.value})} /><br/>
              <select  value={newUser.role}
                       onChange={e=>setNewUser({...newUser,role:e.target.value})} >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select><br/>
              <input  type="password" placeholder="Password"
                      value={newUser.password}
                      onChange={e=>setNewUser({...newUser,password:e.target.value})}
                      required /><br/>
              <button type="submit">Create</button>
            </form>
          </section>

          <section>
            <h2>All Users</h2>
            <table border={1} cellPadding={5}>
              <thead>
                <tr>
                  <th>EmpID</th><th>Name</th><th>Company</th><th>Role</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map(u=>(
                  <tr key={u.empid}>
                    <td>{u.empid}</td>
                    <td>
                      <input
                        defaultValue={u.name}
                        onBlur={e=>handleUpdate(u.empid,{name:e.target.value})}
                      />
                    </td>
                    <td>
                      <input
                        defaultValue={u.company}
                        onBlur={e=>handleUpdate(u.empid,{company:e.target.value})}
                      />
                    </td>
                    <td>
                      <select
                        defaultValue={u.role}
                        onChange={e=>handleUpdate(u.empid,{role:e.target.value})}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      <button onClick={()=>handleDelete(u.empid)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section>
        <h2>Change Your Password</h2>
        <form onSubmit={e => {
          e.preventDefault();
          const oldPassword    = e.target.old.value;
          const newPassword    = e.target.new1.value;
          const confirmPassword= e.target.new2.value;
          handleUpdate(me.empid, { oldPassword, newPassword, confirmPassword });
        }}>
          <input name="old"  type="password" placeholder="Old Password" required /><br/>
          <input name="new1" type="password" placeholder="New Password" required /><br/>
          <input name="new2" type="password" placeholder="Confirm New" required /><br/>
          <button type="submit">Update Password</button>
        </form>
      </section>
    </div>
  );
}
