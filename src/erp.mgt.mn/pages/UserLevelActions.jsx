import React, { useState, useEffect } from "react";
import { useToast } from "../context/ToastContext.jsx";

export default function UserLevelActions() {
  const [groups, setGroups] = useState({ modules: [], buttons: [], functions: [], api: [] });
  const [selected, setSelected] = useState({ modules: [], buttons: [], functions: [], api: [] });
  const [userLevelId, setUserLevelId] = useState("");
  const [missing, setMissing] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    async function loadGroups() {
      try {
        const res = await fetch("/api/permissions/actions", {
          credentials: "include",
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Failed to load action groups");
        }
        const data = await res.json();
        setGroups(data);
        addToast("Action groups loaded", "success");
      } catch (err) {
        console.error("Failed to load action groups", err);
        addToast(`Failed to load action groups: ${err.message}`, "error");
      }
    }
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadCurrent() {
    if (!userLevelId) {
      addToast("User Level ID required", "error");
      return;
    }
    if (userLevelId === "1") {
      const sel = {
        modules: groups.modules,
        buttons: groups.buttons,
        functions: groups.functions,
        api: groups.api,
      };
      setSelected(sel);
      setMissing(null);
      addToast("System admin has access to all actions", "info");
      return;
    }
    fetch(`/api/permissions/actions/${userLevelId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load current actions");
        return res.json();
      })
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
        addToast("Current actions loaded", "success");
      })
      .catch((err) => {
        console.error("Failed to load current actions", err);
        addToast("Failed to load current actions", "error");
      });
  }

  function handleSelect(type, options) {
    setSelected((prev) => ({ ...prev, [type]: options }));
  }

  async function handleSave() {
    if (!userLevelId) {
      addToast("User Level ID required", "error");
      return;
    }
    if (userLevelId === "1") {
      addToast("System admin permissions cannot be modified", "error");
      return;
    }
    try {
      const res = await fetch(`/api/permissions/actions/${userLevelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(selected),
      });
      if (res.ok) {
        addToast("Actions updated", "success");
      } else {
        addToast("Failed to save actions", "error");
      }
    } catch (err) {
      console.error("Failed to save actions", err);
      addToast("Failed to save actions", "error");
    }
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
      <button onClick={handleSave} disabled={userLevelId === "1"}>
        Save
      </button>
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
