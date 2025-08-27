import React, { useState, useEffect } from "react";
import { useToast } from "../context/ToastContext.jsx";

export default function UserLevelActions() {
  const [groups, setGroups] = useState({ modules: [], forms: {}, permissions: [] });
  const [allActions, setAllActions] = useState({
    buttons: [],
    functions: [],
    api: [],
    permissions: [],
  });
  const [selected, setSelected] = useState({
    modules: [],
    buttons: [],
    functions: [],
    api: [],
    permissions: [],
  });
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
      const permissions = data.permissions || [];
      const buttons = new Set();
      const functions = new Set();
      const api = new Set();
      const collect = (items, set) => {
        if (!items) return;
        for (const it of items) {
          if (typeof it === "string") set.add(it);
          else if (it && typeof it === "object") set.add(it.key);
        }
      };
      for (const form of Object.values(forms)) {
        collect(form.buttons, buttons);
        collect(form.functions, functions);
        collect(form.api, api);
      }
      setGroups({ modules: data.modules || [], forms, permissions });
      setAllActions({
        buttons: Array.from(buttons),
        functions: Array.from(functions),
        api: Array.from(api),
        permissions: permissions.map((p) =>
          typeof p === "string" ? p : p.key,
        ),
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

  function flattenModules(list) {
    const keys = [];
    for (const m of list) {
      keys.push(m.key);
      if (m.children?.length) {
        keys.push(...flattenModules(m.children));
      }
    }
    return keys;
  }

  function loadCurrent() {
    if (!userLevelId) {
      addToast("User Level ID required", "error");
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
            (k) =>
              !["buttons", "functions", "api", "permissions"].includes(k),
          ),
          buttons: Object.keys(data.buttons || {}),
          functions: Object.keys(data.functions || {}),
          api: Object.keys(data.api || {}),
          permissions: Object.keys(data.permissions || {}),
        };
        const validModules = new Set(flattenModules(groups.modules));
        const validButtons = new Set(allActions.buttons);
        const validFunctions = new Set(allActions.functions);
        const validApi = new Set(allActions.api);
        const validPermissions = new Set(allActions.permissions);
        sel.modules = sel.modules.filter((m) => validModules.has(m));
        sel.buttons = sel.buttons.filter((b) => validButtons.has(b));
        sel.functions = sel.functions.filter((f) => validFunctions.has(f));
        sel.api = sel.api.filter((a) => validApi.has(a));
        sel.permissions = sel.permissions.filter((p) =>
          validPermissions.has(p),
        );
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

  function buildTree(items) {
    const root = { name: null, children: new Map(), entries: [] };
    for (const it of items || []) {
      const key = typeof it === "string" ? it : it.key;
      const label =
        it && typeof it === "object"
          ? it.name || it.description || describe(key)
          : describe(key);
      const path =
        it && typeof it === "object" && it.group
          ? it.group.split("/").filter(Boolean)
          : [];
      let node = root;
      for (const part of path) {
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, children: new Map(), entries: [] });
        }
        node = node.children.get(part);
      }
      node.entries.push({ key, label });
    }
    return root;
  }

  function collectKeys(node) {
    let keys = node.entries.map((e) => e.key);
    for (const child of node.children.values()) {
      keys = keys.concat(collectKeys(child));
    }
    return keys;
  }

  function toggleGroup(type, keys, checked) {
    setSelected((prev) => {
      const current = new Set(prev[type]);
      if (checked) keys.forEach((k) => current.add(k));
      else keys.forEach((k) => current.delete(k));
      return { ...prev, [type]: Array.from(current) };
    });
  }

  function renderTree(node, type, depth = 0, path = []) {
    const elements = [];
    const currentPath = node.name ? [...path, node.name] : path;
    if (node.name) {
      const keys = collectKeys(node);
      const groupChecked = keys.every((k) => selected[type].includes(k));
      elements.push(
        <label
          key={`${currentPath.join("/")}-group`}
          style={{
            display: "block",
            marginLeft: depth * 20,
            fontWeight: "bold",
          }}
        >
          <input
            type="checkbox"
            checked={groupChecked}
            onChange={(e) => toggleGroup(type, keys, e.target.checked)}
          />
          {node.name}
        </label>,
      );
    }
    for (const entry of node.entries) {
      elements.push(
        <label
          key={`${currentPath.join("/")}-${entry.key}`}
          style={{ display: "block", marginLeft: (depth + 1) * 20 }}
        >
          <input
            type="checkbox"
            checked={selected[type].includes(entry.key)}
            onChange={(e) => toggle(type, entry.key, e.target.checked)}
          />
          {entry.label}
        </label>,
      );
    }
    for (const child of node.children.values()) {
      elements.push(...renderTree(child, type, depth + 1, currentPath));
    }
    return elements;
  }

  function renderActionTree(type, items) {
    const tree = buildTree(items);
    return (
      <div style={{ maxHeight: "200px", overflowY: "auto" }}>
        {renderTree(tree, type)}
      </div>
    );
  }

  function renderModuleTree(items, depth = 0) {
    return items.map((m) => (
      <div key={m.key} style={{ marginLeft: depth * 20 }}>
        <label>
          <input
            type="checkbox"
            checked={selected.modules.includes(m.key)}
            onChange={(e) => toggle("modules", m.key, e.target.checked)}
          />
          {m.name}
        </label>
        {m.children?.length ? renderModuleTree(m.children, depth + 1) : null}
      </div>
    ));
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
        disabled={!userLevelId}
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
          {renderModuleTree(groups.modules)}
        </div>
        {groups.permissions?.length ? (
          <div>
            <h3>Permissions</h3>
            {renderActionTree("permissions", groups.permissions)}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
        {Object.entries(groups.forms).map(([formKey, form]) => (
          <div key={formKey} style={{ minWidth: "200px" }}>
            <h3>{form.name || describe(formKey)}</h3>
            {form.buttons?.length ? (
              <div>
                <h4>Buttons</h4>
                {renderActionTree("buttons", form.buttons)}
              </div>
            ) : null}
            {form.functions?.length ? (
              <div>
                <h4>Functions</h4>
                {renderActionTree("functions", form.functions)}
              </div>
            ) : null}
            {form.api?.length ? (
              <div>
                <h4>APIs</h4>
                {renderActionTree("api", form.api)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
