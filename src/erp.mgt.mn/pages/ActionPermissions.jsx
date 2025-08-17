// src/erp.mgt.mn/pages/ActionPermissions.jsx
import React, { useEffect, useState } from "react";

export default function ActionPermissions() {
  const [groups, setGroups] = useState({
    modules: [],
    buttons: [],
    functions: [],
    api: [],
  });
  const [selected, setSelected] = useState({
    modules: [],
    buttons: [],
    functions: [],
    api: [],
  });
  const [original, setOriginal] = useState({
    modules: [],
    buttons: [],
    functions: [],
    api: [],
  });
  const [userLevelId, setUserLevelId] = useState("");

  useEffect(() => {
    fetch("/api/permissions/actions", { credentials: "include" })
      .then((res) => res.json())
      .then(setGroups)
      .catch((err) => console.error("Failed to load action groups", err));
  }, []);

  function loadCurrent() {
    if (!userLevelId) return;
    fetch(`/api/permissions/actions/${userLevelId}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        const sel = {
          modules: Object.keys(data).filter(
            (k) => !["buttons", "functions", "api"].includes(k),
          ),
          buttons: Object.keys(data.buttons || {}),
          functions: Object.keys(data.functions || {}),
          api: Object.keys(data.api || {}),
        };
        setSelected(sel);
        setOriginal(sel);
      })
      .catch((err) => console.error("Failed to load current actions", err));
  }

  function handleSelect(type, options) {
    setSelected((prev) => ({ ...prev, [type]: options }));
  }

  function mapType(type) {
    if (type === "modules") return "module_key";
    if (type === "buttons") return "button";
    if (type === "functions") return "function";
    return "API";
  }

  async function handleSave() {
    if (!userLevelId) return;
    const types = ["modules", "buttons", "functions", "api"];
    try {
      for (const t of types) {
        const added = selected[t].filter((x) => !original[t].includes(x));
        const removed = original[t].filter((x) => !selected[t].includes(x));
        for (const key of added) {
          const res = await fetch("/api/permissions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              userLevelId,
              actionType: mapType(t),
              actionKey: key,
            }),
          });
          if (!res.ok) throw new Error("Failed to add permission");
        }
        for (const key of removed) {
          const res = await fetch("/api/permissions", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              userLevelId,
              actionType: mapType(t),
              actionKey: key,
            }),
          });
          if (!res.ok) throw new Error("Failed to remove permission");
        }
      }
      setOriginal(selected);
    } catch (err) {
      console.error(err);
      alert("Failed to save permissions");
    }
  }

  function renderSelect(type, items) {
    return (
      <select
        multiple
        value={selected[type]}
        onChange={(e) =>
          handleSelect(
            type,
            Array.from(e.target.selectedOptions).map((o) => o.value),
          )
        }
        style={{ minWidth: "200px", minHeight: "120px" }}
      >
        {items.map((it) => (
          <option key={it} value={it}>
            {it}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      <h2>Action Permissions</h2>
      <input
        type="text"
        placeholder="User Level ID"
        value={userLevelId}
        onChange={(e) => setUserLevelId(e.target.value)}
        style={{ marginRight: "0.5rem" }}
      />
      <button onClick={loadCurrent} style={{ marginRight: "0.5rem" }}>
        Load
      </button>
      <button onClick={handleSave}>Save</button>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        <div>
          <h3>Modules</h3>
          {renderSelect("modules", groups.modules)}
        </div>
        <div>
          <h3>Buttons</h3>
          {renderSelect("buttons", groups.buttons)}
        </div>
        <div>
          <h3>Functions</h3>
          {renderSelect("functions", groups.functions)}
        </div>
        <div>
          <h3>APIs</h3>
          {renderSelect("api", groups.api)}
        </div>
      </div>
    </div>
  );
}

