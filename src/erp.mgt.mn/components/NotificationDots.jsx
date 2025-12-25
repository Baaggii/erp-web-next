import React from 'react';

export const DEFAULT_NOTIFICATION_COLOR = '#fbbf24';

export default function NotificationDots({
  colors,
  size = '0.55rem',
  gap = '0.25rem',
  marginRight = '0.25rem',
}) {
  const safeColors = Array.isArray(colors)
    ? colors.filter((color) => color !== null && color !== undefined)
    : [];
  if (!safeColors.length) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        marginRight,
      }}
    >
      {safeColors.map((color, idx) => (
        <span
          key={`${color}-${idx}`}
          style={{
            display: 'inline-block',
            backgroundColor: color,
            width: size,
            height: size,
            borderRadius: '50%',
          }}
        />
      ))}
    </span>
  );
}
