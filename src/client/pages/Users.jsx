// File: src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth }            from '../context/AuthContext.jsx';

export default function Users() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [users, setUsers]                   = useState([]);
  const [assignments, setAssignments]      = useState([]);
  const [loading, setLoading]               = useState(true);
  const [message, setMessage]               = useState('');

  // New-user form
  const [newUser, setNewUser] = useState({
    empid: '', name: '', password: '', created_by: user?.empid
  });

  // New-assignment form
  const [newAssign, setNewAssign] = useState({
    empid: '', company_id: '', role: 'user', created_by: user?.empid
  });

  // Password-change form (for self)
  const [pwdForm, setPwdForm] = useState({
    oldPassword: '', newPassword: '', confirmPassword: ''
  });

  // Load both tables
  useEffect(() => {
    Promise.all([
      fetch('/api/users',         { credentials: 'include' }),
      fetch('/api/user_companies',{ credentials: 'include' })
    ])
    .then(async ([uRes, aRes]) => {
      if (!uRes.ok) throw new Error(`Users fetch ${uRes.status}`);
      if (!aRes.ok) throw new Error(`Assignments fetch ${aRes.status}`);
      return [await uRes.json(), await aRes.json()];
    })
    .then(([uData, aData]) => {
      setUsers(uData);
      setAssignments(aData);
    })
    .catch(err => setMessage(err.message))
    .finally(() => setLoading(false));
  }, []);

  // ADMIN CRUD for users
  const createUser = async e => {
    e.preventDefault(); setMessage('');
    try {
      const res  = await fetch('/api/users', {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(newUser)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message||`Error ${res.status}`);
      setUsers(us => [...us, json.user]);
      setNewUser({ empid:'', name:'', password:'', created_by:user.empid });
      setMessage('User created');
    } catch (err) { setMessage(err.message) }
  };

  const updateUser = async (empid, changes) => {
    setMessage('');
    try {
      const res = await fetch(`/api/users/${empid}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(changes)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message||`Error ${res.status}`);
      setUsers(us => us.map(u => u.empid===empid ? {...u,...changes} : u));
      setMessage(json.message||'Updated');
    } catch (err) { setMessage(err.message) }
  };

  const deleteUser = async empid => {
    if (!window.confirm('Delete user?')) return;
    setMessage('');
    try {
      const res = await fetch(`/api/users/${empid}`, {
        method: 'DELETE', credentials: 'include'
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setUsers(us => us.filter(u => u.empid!==empid));
      setMessage('Deleted');
    } catch (err) { setMessage(err.message) }
  };

  // ADMIN CRUD for assignments
  const createAssign = async e => {
    e.preventDefault(); setMessage('');
    try {
      const res = await fetch('/api/user_companies', {
        method: 'POST',
        credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(newAssign)
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setAssignments(a => [...a, newAssign]);
      setNewAssign({ empid:'', company_id:'', role:'user', created_by:user.empid });
      setMessage('Assigned');
    } catch (err) { setMessage(err.message) }
  };

  const deleteAssign = async (empid, company_id) => {
    if (!window.confirm('Unassign user?')) return;
    setMessage('');
    try {
      const res = await fetch(
        `/api/user_companies/${empid}/${company_id}`,
        { method:'DELETE', credentials:'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setAssignments(a => a.filter(x => !(x.empid===empid && x.company_id===company_id)));
      setMessage('Unassigned');
    } catch (err) { setMessage(err.message) }
  };

  // SELF password change
  const changePwd = async e => {
    e.preventDefault(); setMessage('');
    const { oldPassword, newPassword, confirmPassword } = pwdForm;
    if (newPassword!==confirmPassword) {
      setMessage('Passwords do not match'); return;
    }
    const pwOK = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).{8,}$/.test(newPassword);
    if (!pwOK) {
      setMessage('Password needs 8+ chars, upper/lower, digit & symbol');
      return;
    }
    try {
      const res = await fetch(`/api/users/${user.empid}/password`, {
        method:'PUT', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message||`Error ${res.status}`);
      setPwdForm({ oldPassword:'', newPassword:'', confirmPassword:'' });
      setMessage('Password updated');
    } catch (err) { setMessage(err.message) }
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div style={{padding:20}}>
      <h1>User Management</h1>
      {message && <div style={{color:'crimson'}}>{message}</div>}

      {isAdmin && (
        <>
          <h2>Create User</h2>
          <form onSubmit={createUser} style={{display:'grid',gap:8,maxWidth:400}}>
            <input
              required placeholder="EmpID"
              value={newUser.empid}
              onChange={e=>setNewUser({...newUser,empid:e.target.value})}
            />
            <input
              required placeholder="Name"
              value={newUser.name}
              onChange={e=>setNewUser({...newUser,name:e.target.value})}
            />
            <input
              required type="password" placeholder="Password"
              value={newUser.password}
              onChange={e=>setNewUser({...newUser,password:e.target.value})}
            />
            <button type="submit">Create</button>
          </form>

          <h2>All Users</h2>
          <table border={1} cellPadding={5}>
            <thead>
              <tr>
                <th>EmpID</th><th>Name</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.empid}>
                  <td>{u.empid}</td>
                  <td>
                    <input
                      value={u.name}
                      onChange={e=>updateUser(u.empid,{name:e.target.value})}
                    />
                  </td>
                  <td>
                    <button onClick={()=>deleteUser(u.empid)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Company Assignments</h2>
          <form onSubmit={createAssign} style={{display:'grid',gap:8,maxWidth:400}}>
            <input
              required placeholder="EmpID"
              value={newAssign.empid}
              onChange={e=>setNewAssign({...newAssign,empid:e.target.value})}
            />
            <input
              required placeholder="Company ID"
              value={newAssign.company_id}
              onChange={e=>setNewAssign({...newAssign,company_id:e.target.value})}
            />
            <select
              value={newAssign.role}
              onChange={e=>setNewAssign({...newAssign,role:e.target.value})}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button type="submit">Assign</button>
          </form>

          <table border={1} cellPadding={5}>
            <thead>
              <tr>
                <th>EmpID</th><th>Company</th><th>Role</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(a=>(
                <tr key={`${a.empid}-${a.company_id}`}>
                  <td>{a.empid}</td>
                  <td>{a.company_id}</td>
                  <td>{a.role}</td>
                  <td>
                    <button
                      onClick={()=>deleteAssign(a.empid,a.company_id)}
                    >Unassign</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Change Your Password</h2>
      <form onSubmit={changePwd} style={{display:'grid',gap:8,maxWidth:400}}>
        <input
          type="password" required placeholder="Old Password"
          value={pwdForm.oldPassword}
          onChange={e=>setPwdForm({...pwdForm,oldPassword:e.target.value})}
        />
        <input
          type="password" required placeholder="New Password"
          value={pwdForm.newPassword}
          onChange={e=>setPwdForm({...pwdForm,newPassword:e.target.value})}
        />
        <input
          type="password" required placeholder="Confirm Password"
          value={pwdForm.confirmPassword}
          onChange={e=>setPwdForm({...pwdForm,confirmPassword:e.target.value})}
        />
        <button type="submit">Update Password</button>
      </form>
    </div>
  );
}
