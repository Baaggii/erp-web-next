// src/client/components/MosaicLayout.jsx
import React, { useState } from 'react';
import { Mosaic, MosaicWindow } from 'react-mosaic-component';

const WINDOW_IDS = ['sales', 'gl', 'purchase', 'reports'];

function renderTile(id, path) {
  let Content;
  switch (id) {
    case 'sales':
      Content = () => <div style={{ padding: 10 }}>📊 Sales Dashboard</div>;
      break;
    case 'gl':
      Content = () => <div style={{ padding: 10 }}>📓 GL Inquiry</div>;
      break;
    case 'purchase':
      Content = () => <div style={{ padding: 10 }}>🛒 Purchase Orders</div>;
      break;
    case 'reports':
      Content = () => <div style={{ padding: 10 }}>📈 Reports Viewer</div>;
      break;
    default:
      Content = () => <div style={{ padding: 10 }}>❓ Unknown Window</div>;
  }

  return (
    <MosaicWindow path={path} title={id.toUpperCase()}>
      <Content />
    </MosaicWindow>
  );
}

export default function MosaicLayout() {
  // Tweak this split tree however you'd like
  const initialValue = {
    direction: 'row',
    first: 'sales',
    second: {
      direction: 'column',
      first: {
        direction: 'row',
        first: 'gl',
        second: 'purchase',
      },
      second: 'reports',
    },
  };

  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
      <Mosaic
        renderTile={renderTile}
        initialValue={initialValue}
        className="mosaic-blueprint-theme"
      />
    </div>
  );
}
