import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newUser, setNewUser] = useState({
    empid: '', name:'', password:'', role:'user'
  });
  const [newAssign, setNewAssign] = useState({
    empid:'', company_id:'', role:'user'
  });
  const [profilePw, setProfilePw] = useState({
    oldPassword:'', newPassword:'', confirm:''
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // load company list if needed
    fetch('/api/companies', { credentials:'include' })
      .then(r=>r.json()).then(setCompanies);

    if (isAdmin) {
      fetch('/api/users', { credentials:'include' })
        .then(r=>r.json()).then(setUsers)
        .catch(()=>setUsers([]));
    }
  }, [isAdmin]);

  // create user
  const handleCreate = async e => {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/users', {
      method:'POST', credentials:'include',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(newUser)
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.message);
    } else {
      setUsers(u=>[...u, j.user]);
      setMsg('Created');
      setNewUser({empid:'',name:'',password:'',role:'user'});
    }
  };

  // assign company
  const handleAssign = async e => {
    e.preventDefault(); setMsg('');
    const res = await fetch('/api/user_companies', {
      method:'POST', credentials:'include',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(newAssign)
    });
    const j = await res.json();
    if (!res.ok) setMsg(j.message); else {
      setMsg('Assigned');
      setNewAssign({empid:'',company_id:'',role:'user'});
    }
  };

  // change own password
  const handlePw = async e => {
    e.preventDefault(); setMsg('');
    const res = await fetch(`/api/users/${user.id}/password`, {
      method:'PUT', credentials:'include',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(profilePw)
    });
    const j = await res.json();
    if (!res.ok) setMsg(j.message); else setMsg('Password updated');
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
              <input
                placeholder="EmpID"
                value={newUser.empid}
                onChange={e => setNewUser({...newUser, empid:e.target.value})}
                required
              /><br/>
              <input
                placeholder="Name"
                value={newUser.name}
                onChange={e => setNewUser({...newUser, name:e.target.value})}
                required
              /><br/>
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={e => setNewUser({...newUser, password:e.target.value})}
                required
              /><br/>
              <select
                value={newUser.role}
                onChange={e => setNewUser({...newUser, role:e.target.value})}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select><br/>
              <button>Create</button>
            </form>
          </section>

          <section>
            <h2>All Users</h2>
            <table border="1" cellPadding="5">
              <thead>
                <tr><th>ID</th><th>EmpID</th><th>Name</th><th>Role</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.empid}</td>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Company Assignments</h2>
            <form onSubmit={handleAssign}>
              <input
                placeholder="EmpID"
                value={newAssign.empid}
                onChange={e => setNewAssign({...newAssign, empid:e.target.value})}
                required
              /><br/>
              <select
                value={newAssign.company_id}
                onChange={e => setNewAssign({...newAssign, company_id:e.target.value})}
                required
              >
                <option value="">— select company —</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select><br/>
              <select
                value={newAssign.role}
                onChange={e => setNewAssign({...newAssign, role:e.target.value})}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select><br/>
              <button>Assign</button>
            </form>
          </section>
        </>
      )}

      <section>
        <h2>Change Your Password</h2>
        <form onSubmit={handlePw}>
          <input
            type="password"
            placeholder="Old Password"
            value={profilePw.oldPassword}
            onChange={e => setProfilePw({...profilePw, oldPassword:e.target.value})}
            required
          /><br/>
          <input
            type="password"
            placeholder="New Password"
            value={profilePw.newPassword}
            onChange={e => setProfilePw({...profilePw, newPassword:e.target.value})}
            required
          /><br/>
          <input
            type="password"
            placeholder="Confirm Password"
            value={profilePw.confirm}
            onChange={e => setProfilePw({...profilePw, confirm:e.target.value})}
            required
          /><br/>
          <button>Update Password</button>
        </form>
      </section>
    </div>
  );
}
