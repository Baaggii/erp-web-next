// File: src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Users() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [users, setUsers]             = useState([]);
  const [assigns, setAssigns]         = useState([]);
  const [newUser, setNewUser]         = useState({ empid:'', name:'', password:'', role:'user' });
  const [newAssign, setNewAssign]     = useState({ empid:'', company:'', role:'user' });
  const [pwdForm, setPwdForm]         = useState({ oldPassword:'', newPassword:'', confirmPassword:'' });
  const [message, setMessage]         = useState('');

  // Load lists
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/erp/api/users', { credentials:'include' })
      .then(r => r.json()).then(setUsers).catch(e=>setMessage(e.message));
    fetch('/erp/api/user_companies', { credentials:'include' })
      .then(r => r.json()).then(setAssigns).catch(e=>setMessage(e.message));
  }, [isAdmin]);

  // === Admin: create user ===
  const handleCreate = async e => {
    e.preventDefault(); setMessage('');
    try {
      const res = await fetch('/erp/api/users', {
        method:'POST', credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(newUser)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setUsers(u=>[...u,json.user]);
      setNewUser({ empid:'',name:'',password:'',role:'user' });
      setMessage('User created');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // === Admin: assign company ===
  const handleAssign = async e => {
    e.preventDefault(); setMessage('');
    try {
      const res = await fetch('/erp/api/user_companies', {
        method:'POST', credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(newAssign)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setAssigns(a=>[...a,json.assignment]);
      setNewAssign({ empid:'',company:'',role:'user' });
      setMessage('Assigned');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // === Admin: update user (name/role) ===
  const handleUserUpdate = async (id, changes) => {
    setMessage('');
    try {
      const res = await fetch(`/erp/api/users/${id}`, {
        method:'PUT', credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(changes)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setUsers(u=>u.map(x=>x.id===id?{...x,...changes}:x));
      setMessage('Updated');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // === Admin: delete user ===
  const handleUserDelete = async id => {
    if (!window.confirm('Delete this user?')) return;
    setMessage('');
    try {
      const res = await fetch(`/erp/api/users/${id}`, {
        method:'DELETE', credentials:'include'
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setUsers(u=>u.filter(x=>x.id!==id));
      setMessage('Deleted');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // === Admin: update assignment role ===
  const handleAssignUpdate = async (id, role) => {
    setMessage('');
    try {
      const res = await fetch(`/erp/api/user_companies/${id}`, {
        method:'PUT', credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ role })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setAssigns(a=>a.map(x=>x.id===id?{...x,role}:x));
      setMessage('Assignment updated');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // === Admin: delete assignment ===
  const handleAssignDelete = async id => {
    if (!window.confirm('Remove this assignment?')) return;
    setMessage('');
    try {
      const res = await fetch(`/erp/api/user_companies/${id}`, {
        method:'DELETE', credentials:'include'
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setAssigns(a=>a.filter(x=>x.id!==id));
      setMessage('Removed');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // === Self: change password ===
  const handleChangePwd = async e => {
    e.preventDefault(); setMessage('');
    const { oldPassword, newPassword, confirmPassword } = pwdForm;
    if (newPassword !== confirmPassword) {
      setMessage("New passwords don't match");
      return;
    }
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).{8,}$/.test(newPassword);
    if (!strong) {
      setMessage('Password must be 8+ chars with upper, lower, digit & symbol');
      return;
    }
    try {
      const res = await fetch(`/erp/api/users/${user.id}`, {
        method:'PUT', credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ oldPassword, password:newPassword })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setPwdForm({ oldPassword:'', newPassword:'', confirmPassword:'' });
      setMessage('Password updated');
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <div style={{ padding:20, maxWidth:900, margin:'auto' }}>
      <h1>User Management</h1>
      {message && <p style={{ color: /error/i.test(message)?'red':'green' }}>{message}</p>}

      {isAdmin && (
      <>
        <section>
          <h2>Create User</h2>
          <form onSubmit={handleCreate} style={{ display:'grid', gap:8, maxWidth:400 }}>
            <input
              placeholder="EmpID"
              value={newUser.empid}
              onChange={e=>setNewUser({...newUser,empid:e.target.value})}
              required
            />
            <input
              placeholder="Name"
              value={newUser.name}
              onChange={e=>setNewUser({...newUser,name:e.target.value})}
            />
            <input
              type="password"
              placeholder="Password"
              value={newUser.password}
              onChange={e=>setNewUser({...newUser,password:e.target.value})}
              required
            />
            <select
              value={newUser.role}
              onChange={e=>setNewUser({...newUser,role:e.target.value})}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button>Create</button>
          </form>
        </section>

        <section>
          <h2>All Users</h2>
          <table border={1} cellPadding={5} cellSpacing={0} style={{ width:'100%', marginTop:10 }}>
            <thead>
              <tr><th>ID</th><th>EmpID</th><th>Name</th><th>Role</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.empid}</td>
                  <td>
                    <input
                      value={u.name}
                      onChange={e=>handleUserUpdate(u.id,{ name:e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e=>handleUserUpdate(u.id,{ role:e.target.value })}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={()=>handleUserDelete(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Company Assignments</h2>
          <form onSubmit={handleAssign} style={{ display:'grid', gap:8, maxWidth:400 }}>
            <input
              placeholder="EmpID"
              value={newAssign.empid}
              onChange={e=>setNewAssign({...newAssign,empid:e.target.value})}
              required
            />
            <input
              placeholder="Company ID"
              value={newAssign.company}
              onChange={e=>setNewAssign({...newAssign,company:e.target.value})}
              required
            />
            <select
              value={newAssign.role}
              onChange={e=>setNewAssign({...newAssign,role:e.target.value})}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button>Assign</button>
          </form>
          <table border={1} cellPadding={5} cellSpacing={0} style={{ width:'100%', marginTop:10 }}>
            <thead>
              <tr><th>ID</th><th>EmpID</th><th>Company</th><th>Role</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {assigns.map(a=>(
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.empid}</td>
                  <td>{a.company}</td>
                  <td>
                    <select
                      value={a.role}
                      onChange={e=>handleAssignUpdate(a.id, e.target.value)}
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={()=>handleAssignDelete(a.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
      )}

      <section style={{ marginTop:40 }}>
        <h2>Change Your Password</h2>
        <form onSubmit={handleChangePwd} style={{ display:'grid', gap:8, maxWidth:400 }}>
          <input
            type="password"
            placeholder="Old Password"
            value={pwdForm.oldPassword}
            onChange={e=>setPwdForm({...pwdForm,oldPassword:e.target.value})}
            required
          />
          <input
            type="password"
            placeholder="New Password"
            value={pwdForm.newPassword}
            onChange={e=>setPwdForm({...pwdForm,newPassword:e.target.value})}
            required
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={pwdForm.confirmPassword}
            onChange={e=>setPwdForm({...pwdForm,confirmPassword:e.target.value})}
            required
          />
          <button>Update Password</button>
        </form>
      </section>
    </div>
  );
}
