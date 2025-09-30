// src/erp.mgt.mn/pages/Forms.jsx
import React from 'react';
import { useOutlet } from 'react-router-dom';
import FormsIndex from './FormsIndex.jsx';
import { useTour } from '../components/ERPLayout.jsx';
export default function FormsPage() {
  const outlet = useOutlet();
  useTour('forms');
  return outlet || <FormsIndex />;
}

