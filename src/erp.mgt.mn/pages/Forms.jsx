import React,{useEffect,useState} from 'react';
export default function Forms(){
  const [cfg,setCfg]=useState(null);
  const [v,setV]=useState({});
  useEffect(()=>{fetch('/erp/api/forms',{credentials:'include'}).then(r=>r.json()).then(d=>setCfg(d.forms[0]));},[]);
  if(!cfg) return <div>Loading...</div>;
  return <form onSubmit={e=>{e.preventDefault();fetch('/erp/api/data',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(v)}).then(r=>r.json()).then(console.log);}}>
    <h2>{cfg.label}</h2>{cfg.fields.map(f=>(
      <div key={f.name}><label>{f.label}</label><input name={f.name} type={f.type} required={f.required} onChange={e=>setV({...v,[e.target.name]:e.target.value})}/></div>
    ))}<button type="submit">Submit</button></form>;
}