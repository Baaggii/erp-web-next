import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function TooltipWrapper({ title, children }) {
  const { userSettings } = useAuth();
  const enabled = userSettings.tooltipsEnabled !== false;
  if (!title) {
    return children;
  }
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { title })
    : children;
  return (
    <span className="tooltip-wrapper" title={title} data-tooltip={enabled ? title : undefined}>
      {child}
    </span>
  );
}
