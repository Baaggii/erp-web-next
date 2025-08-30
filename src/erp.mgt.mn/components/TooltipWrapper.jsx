import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function TooltipWrapper({ title, children }) {
  const { userSettings } = useAuth();
  const enabled = userSettings.tooltipsEnabled !== false;
  if (!title) {
    return children;
  }
  return (
    <span
      className="tooltip-wrapper"
      title={enabled ? title : undefined}
      aria-label={enabled ? title : undefined}
      data-tooltip={enabled ? title : undefined}
    >
      {children}
    </span>
  );
}
