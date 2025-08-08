import React from 'react';
import { useModules } from '../hooks/useModules.js';
import modulePath from '../utils/modulePath.js';

export default function ReportManagement() {
  const modules = useModules();

  function openReportBuilder() {
    const map = {};
    modules.forEach((m) => {
      map[m.module_key] = m;
    });
    const builder = modules.find((m) => m.module_key === 'report_builder');
    const path = builder ? modulePath(builder, map) : '/report-management/report-builder';
    window.open(`#${path}`, '_blank', 'noopener');
  }

  return (
    <div>
      <h2>Тайлангийн удирдлага</h2>
      <p>Энд тайлангийн тохиргоо хийнэ.</p>
      <button onClick={openReportBuilder}>Report Builder</button>
    </div>
  );
}
