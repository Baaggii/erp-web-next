import React, { useState, useEffect } from "react";
import { useToast } from "../context/ToastContext.jsx";

export default function UserLevelActions() {
  const [groups, setGroups] = useState({ modules: [], forms: {} });
  const [allActions, setAllActions] = useState({ buttons: [], functions: [], api: [] });
  const [selected, setSelected] = useState({ modules: [], buttons: [], functions: [], api: [] });
  const [userLevelId, setUserLevelId] = useState("");
  const [userLevels, setUserLevels] = useState([]);
  const { addToast } = useToast();

  const loadGroups = async () => {
    try {
      const res = await fetch("/api/permissions/actions", { credentials: "include" });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load action groups");
      }
      const data = await res.json();
      const forms = data.forms || {};
      const buttons = new Set();
      const functions = new Set();
      const api = new Set();
      for (const form of Object.values(forms)) {
        form.buttons?.forEach((b) => buttons.add(b));
        form.functions?.forEach((f) => functions.add(f));
        form.api?.forEach((a) => {
          const key = typeof a === "string" ? a : a.key;
          api.add(key);
        });
      }
      setGroups({ modules: data.modules || [], forms });
      setAllActions({
        buttons: Array.from(buttons),
        functions: Array.from(functions),
        api: Array.from(api),
      });
      addToast("Action groups loaded", "success");
    } catch (err) {
      console.error("Failed to load action groups", err);
      addToast(`Failed to load action groups: ${err.message}`, "error");
    }
  };

  useEffect(() => {
    loadGroups();
    fetch("/api/permissions/user-levels", { credentials: "include" })
      .then((res) => res.json())
      .then(setUserLevels)
      .catch(() => addToast("Failed to load user levels", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadCurrent() {
    if (!userLevelId) {
      addToast("User Level ID required", "error");
      return;
    }
    if (userLevelId === "1") {
      const sel = {
        modules: groups.modules.map((m) => m.key),
        buttons: allActions.buttons,
        functions: allActions.functions,
        api: allActions.api,
      };
      setSelected(sel);
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
        const validModules = new Set(groups.modules.map((m) => m.key));
        const validButtons = new Set(allActions.buttons);
        const validFunctions = new Set(allActions.functions);
        const validApi = new Set(allActions.api);
        sel.modules = sel.modules.filter((m) => validModules.has(m));
        sel.buttons = sel.buttons.filter((b) => validButtons.has(b));
        sel.functions = sel.functions.filter((f) => validFunctions.has(f));
        sel.api = sel.api.filter((a) => validApi.has(a));
        setSelected(sel);
        addToast("Current actions loaded", "success");
      })
      .catch((err) => {
        console.error("Failed to load current actions", err);
        addToast("Failed to load current actions", "error");
      });
  }

  function toggle(type, action, checked) {
    setSelected((prev) => {
      const current = new Set(prev[type]);
      if (checked) current.add(action);
      else current.delete(action);
      return { ...prev, [type]: Array.from(current) };
    });
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

  function describe(key) {
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function renderChecklist(type, items) {
    return (
      <div style={{ maxHeight: "200px", overflowY: "auto" }}>
        {items.map((it) => {
          const key = typeof it === "string" ? it : it.key;
          const label =
            it.name ||
            (type === "api" && typeof it === "object"
              ? it.description || it.key
              : describe(key));
          return (
            <label key={key} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={selected[type].includes(key)}
                onChange={(e) => toggle(type, key, e.target.checked)}
              />
              {label}
            </label>
          );
        })}
      </div>
    );
  }

  async function handlePopulate() {
    const allow = window.confirm(
      "Allow all new operations by default? Click Cancel to disallow.",
    );
    try {
      const res = await fetch("/api/permissions/actions/populate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ allow }),
      });
      if (res.ok) {
        addToast("Permissions populated", "success");
        loadGroups();
      } else {
        addToast("Failed to populate permissions", "error");
      }
    } catch (err) {
      console.error("Failed to populate permissions", err);
      addToast("Failed to populate permissions", "error");
    }
  }

  return (
    <div>
      <h2>User Level Actions</h2>
      <select
        value={userLevelId}
        onChange={(e) => setUserLevelId(e.target.value)}
        style={{ marginRight: "0.5rem" }}
      >
        <option value="">Select user level</option>
        {userLevels.map((ul) => (
          <option key={ul.id} value={ul.id}>
            {ul.name || ul.id}
          </option>
        ))}
      </select>
      <button onClick={loadCurrent} style={{ marginRight: "0.5rem" }}>
        Load
      </button>
      <button
        onClick={handleSave}
        disabled={userLevelId === "1"}
        style={{ marginRight: "0.5rem" }}
      >
        Save
      </button>
      <button onClick={loadGroups} style={{ marginRight: "0.5rem" }}>
        Refresh
      </button>
      <button onClick={handlePopulate}>Batch Populate</button>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
        <div>
          <h3>Modules</h3>
          {renderChecklist(
            "modules",
            groups.modules.map((m) => ({ key: m.key, name: m.name })),
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {Object.entries(groups.forms).map(([formKey, form]) => (
          <div key={formKey} style={{ minWidth: "200px" }}>
            <h3>{form.name || describe(formKey)}</h3>
            {form.buttons?.length ? (
              <div>
                <h4>Buttons</h4>
                {renderChecklist("buttons", form.buttons)}
              </div>
            ) : null}
            {form.functions?.length ? (
              <div>
                <h4>Functions</h4>
                {renderChecklist("functions", form.functions)}
              </div>
            ) : null}
            {form.api?.length ? (
              <div>
                <h4>APIs</h4>
                {renderChecklist("api", form.api)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
