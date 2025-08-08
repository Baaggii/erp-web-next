import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useModules } from '../hooks/useModules.js';
import modulePath from '../utils/modulePath.js';

export default function ReportManagement() {
  const navigate = useNavigate();
  const modules = useModules();

  function openReportBuilder() {
    const map = {};
    modules.forEach((m) => {
      map[m.module_key] = m;
    });
    const builder = modules.find((m) => m.module_key === 'report_builder');
    if (builder) {
      navigate(modulePath(builder, map));
    }
  }

  return (
    <div>
      <h2>Тайлангийн удирдлага</h2>
      <p>Энд тайлангийн тохиргоо хийнэ.</p>
      <button onClick={openReportBuilder}>Report Builder</button>
    </div>
  );
}
