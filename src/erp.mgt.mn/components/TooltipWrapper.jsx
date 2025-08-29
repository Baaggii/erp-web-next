import React from 'react';

export default function TooltipWrapper({ title, children }) {
  const [enabled, setEnabled] = React.useState(true);
  React.useEffect(() => {
    const val = localStorage.getItem('tooltipsEnabled');
    setEnabled(val !== 'false');
  }, []);
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
