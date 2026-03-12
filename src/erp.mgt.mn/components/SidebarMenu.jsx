import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';

function buildTree(items) {
  const map = new Map();
  items.forEach((item) => map.set(item.moduleKey, { ...item, children: [] }));
  const roots = [];
  map.forEach((item) => {
    if (item.parentKey && map.has(item.parentKey)) {
      map.get(item.parentKey).children.push(item);
      return;
    }
    roots.push(item);
  });
  return roots;
}

export default function SidebarMenu({ items = [] }) {
  const [expanded, setExpanded] = useState(() => new Set(['dashboard', 'forms', 'reports', 'settings']));
  const tree = useMemo(() => buildTree(items), [items]);

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderNode = (node, level = 0) => {
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.id} style={{ paddingLeft: level * 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasChildren && (
            <button onClick={() => toggle(node.moduleKey)} type="button">
              {expanded.has(node.moduleKey) ? '▾' : '▸'}
            </button>
          )}
          <NavLink to={node.path}>{node.title}</NavLink>
        </div>
        {hasChildren && expanded.has(node.moduleKey) && (
          <div>{node.children.map((child) => renderNode(child, level + 1))}</div>
        )}
      </div>
    );
  };

  return <div>{tree.map((item) => renderNode(item))}</div>;
}
