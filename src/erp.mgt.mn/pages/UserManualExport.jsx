import React, { useState, useEffect, useContext } from "react";
import { marked } from "marked";
import { jsPDF } from "jspdf";
import I18nContext from "../context/I18nContext.jsx";
import { AuthContext } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import headerMappings from "../../../config/headerMappings.json";

export default function UserManualExport() {
  const { t } = useContext(I18nContext);
  const { permissions, session } = useContext(AuthContext);
  const { addToast } = useToast();
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;

  const [manual, setManual] = useState({});
  const [userLevels, setUserLevels] = useState([]);
  const [levelActions, setLevelActions] = useState({});
  const [markdown, setMarkdown] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/permissions/actions", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("failedActions");
        const data = await res.json();
        const struct = {};
        const addModule = (k) => {
          if (!struct[k])
            struct[k] = { buttons: [], functions: [], forms: [], reports: [] };
        };
        (data.modules || []).forEach((m) => addModule(m.key));
        const forms = data.forms || {};
        for (const [fKey, f] of Object.entries(forms)) {
          const mKey = f.module || f.moduleKey || "misc";
          addModule(mKey);
          struct[mKey].forms.push({ key: fKey, ...f });
          (f.buttons || []).forEach((b) =>
            struct[mKey].buttons.push(typeof b === "string" ? b : b.key),
          );
          (f.functions || []).forEach((fn) =>
            struct[mKey].functions.push(
              typeof fn === "string" ? fn : fn.key,
            ),
          );
          (f.reports || []).forEach((r) =>
            struct[mKey].reports.push(typeof r === "string" ? r : r.key),
          );
        }
        setManual(struct);
      } catch (err) {
        console.error(err);
        addToast(
          `${t("failedLoadActions", "Failed to load actions")}: ${err.message}`,
          "error",
        );
      }
      try {
        const res = await fetch("/api/permissions/user-levels", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("failedUserLevels");
        const levels = await res.json();
        setUserLevels(levels);
        for (const lvl of levels) {
          fetch(`/api/permissions/actions/${lvl.id}`, {
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : {}))
            .then((acts) =>
              setLevelActions((prev) => ({ ...prev, [lvl.id]: acts })),
            )
            .catch(() => {});
        }
      } catch (err) {
        console.error(err);
        addToast(
          `${t("failedLoadUserLevels", "Failed to load user levels")}: ${
            err.message
          }`,
          "error",
        );
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMarkdown(buildMarkdown());
  }, [manual, userLevels, levelActions]);

  if (!hasAdmin) {
    return <p>{t("accessDenied", "Access denied")}</p>;
  }

  function translate(key) {
    const mapped = headerMappings[key] || key;
    return t(mapped, mapped);
  }

  function buildMarkdown() {
    let md = `# ${t("userManual", "User Manual")}\n\n`;
    md += `## ${t("forms", "Forms")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.forms.length) continue;
      md += `### ${translate(mKey)}\n`;
      for (const form of mod.forms) {
        md += `- **${translate(form.key)}**\n`;
        if (form.buttons?.length) {
          md += `  - ${t("buttons", "Buttons")}: ${form.buttons
            .map((b) => translate(typeof b === "string" ? b : b.key))
            .join(", ")}\n`;
        }
      }
    }
    md += `\n## ${t("reports", "Reports")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.reports.length) continue;
      md += `### ${translate(mKey)}\n`;
      for (const r of mod.reports) {
        const k = typeof r === "string" ? r : r.key;
        md += `- **${translate(k)}**\n`;
      }
    }
    md += `\n## ${t("settings", "Settings")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.buttons.length && !mod.functions.length) continue;
      md += `### ${translate(mKey)}\n`;
      if (mod.buttons.length) {
        md += `- ${t("buttons", "Buttons")}: ${mod.buttons
          .map((b) => translate(b))
          .join(", ")}\n`;
      }
      if (mod.functions.length) {
        md += `- ${t("functions", "Functions")}: ${mod.functions
          .map((fn) => translate(fn))
          .join(", ")}\n`;
      }
    }
    md += `\n## ${t("quickReference", "Quick Reference")}\n`;
    md += `| ${t("userLevel", "User Level")} | ${t(
      "modules",
      "Modules",
    )} | ${t("buttons", "Buttons")} | ${t("functions", "Functions")} |\n`;
    md += `| --- | --- | --- | --- |\n`;
    userLevels.forEach((lvl) => {
      const acts = levelActions[lvl.id] || {};
      const moduleCount = Object.keys(acts).filter(
        (k) => !["buttons", "functions", "api", "permissions"].includes(k),
      ).length;
      const buttonCount = Object.keys(acts.buttons || {}).length;
      const fnCount = Object.keys(acts.functions || {}).length;
      md += `| ${lvl.name || lvl.id} | ${moduleCount} | ${buttonCount} | ${fnCount} |\n`;
    });
    return md;
  }

  function exportMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "user-manual.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const doc = new jsPDF();
    const lines = markdown.split("\n");
    let y = 10;
    for (const line of lines) {
      doc.text(line, 10, y);
      y += 8;
      if (y > 280) {
        doc.addPage();
        y = 10;
      }
    }
    doc.save("user-manual.pdf");
  }

  const html = marked.parse(markdown);

  return (
    <div>
      <h2>{t("userManual", "User Manual")}</h2>
      <div style={{ marginBottom: "1rem" }}>
        <button onClick={exportMarkdown}>{t("exportMarkdown", "Export Markdown")}</button>
        <button onClick={exportPdf} style={{ marginLeft: "0.5rem" }}>
          {t("exportPdf", "Export PDF")}
        </button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

