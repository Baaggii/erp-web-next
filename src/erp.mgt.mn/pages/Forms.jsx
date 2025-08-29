// src/erp.mgt.mn/pages/Forms.jsx
import React from 'react';
import { useOutlet } from 'react-router-dom';
import FormsIndex from './FormsIndex.jsx';
import i18next from 'i18next';

export default function FormsPage() {
  const outlet = useOutlet();
  return outlet || <FormsIndex />;
}

export const guideSteps = [
  {
    target: 'body',
    content: i18next.t('guide.newTransaction'),
  },
];
