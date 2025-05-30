import { useEffect, useState } from 'react';
export default function Forms() {
  const [forms, setForms] = useState([]);
  useEffect(() => { fetch('/api/forms').then(r => r.json()).then(setForms); }, []);
  return (
    <ul>{forms.map(f => <li key={f.id}>{f.name}</li>)}</ul>
  );
}