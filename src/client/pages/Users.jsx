// File: src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [allUsers, setAllUsers]     = useState([]);
  const [newUser, setNewUser]       = useState({ empid:'', name:'', password:'' });
  const [message, setMessage]       = useState('');

  // load users list (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/erp/api/users', { credentials:'include' })
      .then(r => r.json())
      .then(j => setAllUsers(j.users))
      .catch(e => setMessage(e.message));
  }, [isAdmin]);

  // CREATE
  const create = async e => {
    e.preventDefault();
    setMessage('');
    const res = await fetch('/erp/api/users', {
      method:'POST',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(newUser)
    });
    const j = await res.json();
    if (!res.ok) return setMessage(j.message);
    setAllUsers(u => [...u, j.user]);
    setNewUser({ empid:'', name:'', password:'' });
    setMessage('User created');
  };

  // UPDATE name (admin)
  const updateName = async (empid, name) => {
    await fetch(`/erp/api/users/${empid}`, {
      method:'PUT',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name })
    });
    setAllUsers(u => u.map(x => x.empid===empid ? {...x,name} : x));
  };

  // DELETE
  const del = async empid => {
    if (!confirm('Delete?')) return;
    await fetch(`/erp/api/users/${empid}`, {
      method:'DELETE', credentials:'include'
    });
    setAllUsers(u => u.filter(x=>x.empid!==empid));
  };

  // SELF-password
  const [pwForm, setPwForm] = useState({ old:'', new1:'', new2:'' });
  const changePw = async e => {
    e.preventDefault();
    if (pwForm.new1 !== pwForm.new2) {
      setMessage('Passwords don’t match');
      return;
    }
    const res = await fetch(`/erp/api/users/${user.empid}/password`, {
      method:'PUT',
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ old:pwForm.old, new:pwForm.new1 })
    });
    const j = await res.json();
    setMessage(j.message);
  };

  return (
    <div style={{ padding:20, maxWidth:800, margin:'auto' }}>
      <h1>User Management</h1>
      {message && <p style={{ color:'green' }}>{message}</p>}

      {isAdmin && (
        <>
          <section>
            <h2>Create User</h2>
            <form onSubmit={create}>
              <input
                placeholder="EmpID"
                value={newUser.empid}
                onChange={e=>setNewUser({...newUser,empid:e.target.value})}
                required /><br/>
              <input
                placeholder="Name"
                value={newUser.name}
                onChange={e=>setNewUser({...newUser,name:e.target.value})}
              /><br/>
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={e=>setNewUser({...newUser,password:e.target.value})}
                required /><br/>
              <button>Create</button>
            </form>
          </section>

          <section>
            <h2>All Users</h2>
            <table border={1} cellSpacing={0} cellPadding={5}>
              <thead>
                <tr><th>EmpID</th><th>Name</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {allUsers.map(u=>(
                  <tr key={u.empid}>
                    <td>{u.empid}</td>
                    <td>
                      <input
                        value={u.name}
                        onChange={e=>updateName(u.empid,e.target.value)}
                      />
                    </td>
                    <td>
                      <button onClick={()=>del(u.empid)}>Delete</button>
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
        <form onSubmit={changePw}>
          <input
            type="password"
            placeholder="Old Password"
            value={pwForm.old}
            onChange={e=>setPwForm({...pwForm,old:e.target.value})}
            required /><br/>
          <input
            type="password"
            placeholder="New Password"
            value={pwForm.new1}
            onChange={e=>setPwForm({...pwForm,new1:e.target.value})}
            required /><br/>
          <input
            type="password"
            placeholder="Confirm Password"
            value={pwForm.new2}
            onChange={e=>setPwForm({...pwForm,new2:e.target.value})}
            required /><br/>
          <button>Update Password</button>
        </form>
      </section>
    </div>
  );
}
