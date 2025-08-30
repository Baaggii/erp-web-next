// src/erp.mgt.mn/pages/Forms.jsx
import React, { useMemo } from 'react';
import { useOutlet } from 'react-router-dom';
import FormsIndex from './FormsIndex.jsx';
import { useTour } from '../components/ERPLayout.jsx';
import formsSteps from '../tours/Forms.js';
import { useTranslation } from 'react-i18next';

export default function FormsPage() {
  const outlet = useOutlet();
  const { t } = useTranslation();
  const steps = useMemo(() => formsSteps(t), [t]);
  useTour('forms', steps);
  return outlet || <FormsIndex />;
}

