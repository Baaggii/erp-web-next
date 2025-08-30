import React, { useState, useEffect, useContext } from "react";
import { marked } from "marked";
import PDFDocument from "pdfkit";
import blobStream from "blob-stream";
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
  const [selectedLevel, setSelectedLevel] = useState("");
  const [manualSections, setManualSections] = useState({});

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

      try {
        const res = await fetch("/manuals/manifest.json");
        if (res.ok) {
          const manifest = await res.json();
          const sections = {};
          for (const [mKey, entry] of Object.entries(manifest || {})) {
            if (entry.markdown) {
              try {
                const mdRes = await fetch(`/manuals/${entry.markdown}`);
                if (mdRes.ok) sections[mKey] = await mdRes.text();
              } catch {
                /* ignore */
              }
            }
          }
          setManualSections(sections);
        }
      } catch (err) {
        console.error(err);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMarkdown(buildMarkdown());
  }, [manual, userLevels, levelActions, selectedLevel, manualSections]);

  if (!hasAdmin) {
    return <p>{t("accessDenied", "Access denied")}</p>;
  }

  function describeKey(key) {
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function translate(key) {
    const mapped = headerMappings[key] || key;
    const lbl = t(mapped);
    return lbl === mapped ? describeKey(mapped) : lbl;
  }

  function buildMarkdown() {
    const allowed = selectedLevel ? levelActions[selectedLevel] || {} : null;
    let md = `# ${t("userManual", "User Manual")}\n\n`;
    md += `## ${t("forms", "Forms")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (allowed && !allowed[mKey]) continue;
      const allowedForms = allowed
        ? Object.keys(allowed[mKey]?.forms || {})
        : mod.forms.map((f) => f.key);
      const forms = mod.forms.filter((f) => allowedForms.includes(f.key));
      if (!forms.length && !manualSections[mKey]) continue;
      md += `### ${translate(mKey)}\n`;
      if (manualSections[mKey]) {
        md += `${manualSections[mKey]}\n`;
      }
      for (const form of forms) {
        md += `#### ${translate(form.key)}\n`;
        md += `${t(
          "formIntro",
          `This form enables authorised users to manage records related to ${translate(
            form.key,
          )}.`,
        )}\n`;
        const reqFields = (form.fields || [])
          .filter((f) => f.required)
          .map((f) => translate(f.key || f));
        if (form.buttons?.length) {
          md += `${t(
            "formButtonsIntro",
            "The form exposes the following buttons and their prerequisites:",
          )}\n`;
          for (const btn of form.buttons) {
            const bKey = typeof btn === "string" ? btn : btn.key;
            const fieldsList = reqFields.length
              ? reqFields.join(", ")
              : t("noFields", "no specific fields");
            const sentence = t(
              "buttonPurposeDetail",
              `The ${translate(
                bKey,
              )} button initiates the ${translate(
                bKey,
              )} operation within this form, and it cannot proceed until the following fields have been supplied: ${fieldsList}.`,
            );
            md += `- ${sentence}\n`;
          }
        }
      }
    }

    md += `\n## ${t("reports", "Reports")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (allowed && !allowed[mKey]) continue;
      const allowedReports = allowed
        ? Object.keys(allowed[mKey]?.reports || {})
        : mod.reports.map((r) => (typeof r === "string" ? r : r.key));
      const reports = mod.reports.filter((r) =>
        allowedReports.includes(typeof r === "string" ? r : r.key),
      );
      if (!reports.length) continue;
      md += `### ${translate(mKey)}\n`;
      for (const r of reports) {
        const k = typeof r === "string" ? r : r.key;
        const sentence = t(
          "reportPurposeDetail",
          `The ${translate(k)} report provides a comprehensive overview of the associated data set, presenting information in a structured and readable manner for further analysis.`,
        );
        md += `- ${sentence}\n`;
      }
    }

    md += `\n## ${t("settings", "Settings")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (allowed && !allowed[mKey]) continue;
      const allowedBtns = new Set();
      const allowedFns = new Set();
      if (allowed) {
        const modAllowed = allowed[mKey] || {};
        Object.values(modAllowed.forms || {}).forEach((f) => {
          Object.keys(f.buttons || {}).forEach((b) => allowedBtns.add(b));
          Object.keys(f.functions || {}).forEach((fn) => allowedFns.add(fn));
        });
        Object.keys(allowed.buttons || {}).forEach((b) => allowedBtns.add(b));
        Object.keys(allowed.functions || {}).forEach((fn) => allowedFns.add(fn));
      }
      const buttons = mod.buttons.filter((b) =>
        allowed ? allowedBtns.has(b) : true,
      );
      const functions = mod.functions.filter((fn) =>
        allowed ? allowedFns.has(fn) : true,
      );
      if (!buttons.length && !functions.length) continue;
      md += `### ${translate(mKey)}\n`;
      if (buttons.length) {
        md += `${t(
          "settingsButtonsIntro",
          "The following buttons influence configuration and require careful handling:",
        )}\n`;
        buttons.forEach((b) => {
          const sentence = t(
            "settingsButtonDetail",
            `The ${translate(
              b,
            )} button allows administrators to execute the ${translate(
              b,
            )} operation, applying the current configuration without additional mandatory fields.`,
          );
          md += `- ${sentence}\n`;
        });
      }
      if (functions.length) {
        md += `${t(
          "settingsFunctionsIntro",
          "These functions adjust system behaviour and should be used with understanding of their effects:",
        )}\n`;
        functions.forEach((fn) => {
          const sentence = t(
            "settingsFunctionDetail",
            `The ${translate(
              fn,
            )} function performs the ${translate(
              fn,
            )} process, leveraging the active settings to modify how the application operates.`,
          );
          md += `- ${sentence}\n`;
        });
      }
    }

    md += `\n## ${t("quickReference", "Quick Reference")}\n`;
    md += `| ${t("userLevel", "User Level")} | ${t(
      "modules",
      "Modules",
    )} | ${t("forms", "Forms")} | ${t("reports", "Reports")} | ${t(
      "buttons",
      "Buttons",
    )} | ${t("functions", "Functions")} |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    const levels = selectedLevel
      ? userLevels.filter((l) => l.id === selectedLevel)
      : userLevels;
    levels.forEach((lvl) => {
      const acts = levelActions[lvl.id] || {};
      const moduleEntries = Object.entries(acts).filter(
        ([k]) => !["buttons", "functions", "api", "permissions"].includes(k),
      );
      const moduleCount = moduleEntries.length;
      let formsCount = 0;
      let reportsCount = 0;
      moduleEntries.forEach(([, val]) => {
        formsCount += Object.keys(val.forms || {}).length;
        reportsCount += Object.keys(val.reports || {}).length;
      });
      const buttonCount = Object.keys(acts.buttons || {}).length;
      const fnCount = Object.keys(acts.functions || {}).length;
      md += `| ${lvl.name || lvl.id} | ${moduleCount} | ${formsCount} | ${reportsCount} | ${buttonCount} | ${fnCount} |\n`;
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
    const doc = new PDFDocument();
    const stream = doc.pipe(blobStream());
    const lines = markdown.split("\n");
    lines.forEach((line) => doc.text(line));
    doc.end();
    stream.on("finish", () => {
      const url = stream.toBlobURL("application/pdf");
      const a = document.createElement("a");
      a.href = url;
      a.download = "user-manual.pdf";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const html = marked.parse(markdown);

  return (
    <div>
      <h2>{t("userManual", "User Manual")}</h2>
      <div style={{ marginBottom: "1rem" }}>
        <label>
          {t("userLevel", "User Level")}: 
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            style={{ marginLeft: "0.5rem" }}
          >
            <option value="">{t("all", "All")}</option>
            {userLevels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                {lvl.name || lvl.id}
              </option>
            ))}
          </select>
        </label>
      </div>
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

