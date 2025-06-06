// src/erp.mgt.mn/pages/RolePermissions.jsx
import React, { useEffect, useState, useContext } from "react";
import { refreshRolePermissions } from "../hooks/useRolePermissions.js";
import { AuthContext } from "../context/AuthContext.jsx";

export default function RolePermissions() {
  const [perms, setPerms] = useState([]);
  const [filterRoleId, setFilterRoleId] = useState("");
  const { company } = useContext(AuthContext);

  function loadPerms(roleId) {
    const params = [];
    if (roleId) params.push(`roleId=${encodeURIComponent(roleId)}`);
    if (company) params.push(`companyId=${encodeURIComponent(company.company_id)}`);
    const url = params.length ? `/api/role_permissions?${params.join("&")}` : "/api/role_permissions";
    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch role permissions");
        return res.json();
      })
      .then(setPerms)
      .catch((err) => console.error("Error fetching role permissions:", err));
  }

  useEffect(() => {
    loadPerms();
  }, [company]);

  function handleFilter() {
    loadPerms(filterRoleId);
  }

  async function handleToggle(p) {
    const res = await fetch("/api/role_permissions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        companyId: company?.company_id,
        roleId: p.role_id,
        moduleKey: p.module_key,
        allowed: p.allowed ? 0 : 1,
      }),
    });
    if (!res.ok) {
      alert("Failed to update permission");
      return;
    }
    loadPerms(filterRoleId);
    refreshRolePermissions(p.role_id, company?.company_id);
  }

  return (
    <div>
      <h2>Role Permissions</h2>
      <input
        type="text"
        placeholder="Filter by Role ID"
        value={filterRoleId}
        onChange={(e) => setFilterRoleId(e.target.value)}
        style={{ marginRight: "0.5rem" }}
      />
      <button onClick={handleFilter}>Apply</button>
      {perms.length === 0 ? (
        <p>No permissions.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "0.5rem",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#e5e7eb" }}>
              <th style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                Role
              </th>
              <th style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                Module
              </th>
              <th style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                Allowed
              </th>
              <th style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.role_id + "-" + p.module_key}>
                <td style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                  {p.role}
                </td>
                <td style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                  {p.label}
                </td>
                <td style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                  {p.allowed ? "Yes" : "No"}
                </td>
                <td style={{ padding: "0.5rem", border: "1px solid #d1d5db" }}>
                  <button onClick={() => handleToggle(p)}>
                    {p.allowed ? "Revoke" : "Allow"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
