// src/erp.mgt.mn/pages/Forms.jsx
import React from 'react';
import { useOutlet } from 'react-router-dom';
import FormsIndex from './FormsIndex.jsx';

export default function FormsPage() {
  const outlet = useOutlet();
  return outlet || <FormsIndex />;
}
