import React, { useState, useEffect } from "react";

export default function UserLevelActions() {
  const [groups, setGroups] = useState({ modules: [], buttons: [], functions: [], api: [] });
  const [selected, setSelected] = useState({ modules: [], buttons: [], functions: [], api: [] });
  const [userLevelId, setUserLevelId] = useState("");
  const [missing, setMissing] = useState(null);

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
            (k) => !["buttons", "functions", "api"].includes(k)
          ),
          buttons: Object.keys(data.buttons || {}),
          functions: Object.keys(data.functions || {}),
          api: Object.keys(data.api || {}),
        };
        setSelected(sel);
        setMissing({
          modules: groups.modules.filter((m) => !sel.modules.includes(m)),
          buttons: groups.buttons.filter((b) => !sel.buttons.includes(b)),
          functions: groups.functions.filter((f) => !sel.functions.includes(f)),
          api: groups.api.filter((a) => !sel.api.includes(a)),
        });
      })
      .catch((err) => console.error("Failed to load current actions", err));
  }

  function handleSelect(type, options) {
    setSelected((prev) => ({ ...prev, [type]: options }));
  }

  async function handleSave() {
    if (!userLevelId) return;
    const res = await fetch(`/api/permissions/actions/${userLevelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(selected),
    });
    if (!res.ok) alert("Failed to save actions");
  }

  function renderSelect(type, items) {
    return (
      <select
        multiple
        value={selected[type]}
        onChange={(e) =>
          handleSelect(type, Array.from(e.target.selectedOptions).map((o) => o.value))
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
      <h2>User Level Actions</h2>
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
      {missing &&
        (missing.modules.length ||
          missing.buttons.length ||
          missing.functions.length ||
          missing.api.length) > 0 && (
          <div
            style={{
              backgroundColor: "#ffeeba",
              padding: "1rem",
              marginTop: "1rem",
            }}
          >
            <strong>Missing permissions detected:</strong>
            <ul>
              {missing.modules.map((m) => (
                <li key={`m-${m}`}>Module: {m}</li>
              ))}
              {missing.buttons.map((b) => (
                <li key={`b-${b}`}>Button: {b}</li>
              ))}
              {missing.functions.map((f) => (
                <li key={`f-${f}`}>Function: {f}</li>
              ))}
              {missing.api.map((a) => (
                <li key={`a-${a}`}>API: {a}</li>
              ))}
            </ul>
          </div>
        )}
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
