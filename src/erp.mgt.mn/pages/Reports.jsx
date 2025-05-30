import { useEffect, useState } from 'react';
export default function Reports() {
  const [data, setData] = useState([]);
  useEffect(() => { fetch('/api/reports/sales').then(r => r.json()).then(setData); }, []);
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}