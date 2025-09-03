import React, { useState, useEffect, useContext } from "react";
import { marked } from "marked";
import { jsPDF } from "jspdf";
import I18nContext from "../context/I18nContext.jsx";
import { AuthContext } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import headerMappings from "../../../config/headerMappings.json";
import translateWithAI from "../utils/translateWithAI.js";

export default function UserManualExport() {
  const { t, lang: uiLang } = useContext(I18nContext);
  const { permissions, session } = useContext(AuthContext);
  const { addToast } = useToast();
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;

  const [lang, setLang] = useState(uiLang);
  const languages = ["en", "mn", "ja", "ko", "zh", "es", "de", "fr", "ru"];
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
          `${t("failedLoadActions", "Failed to load actions", { lng: lang })}: ${err.message}`,
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
          `${t("failedLoadUserLevels", "Failed to load user levels", { lng: lang })}: ${err.message}`,
          "error",
        );
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function build() {
      const md = await buildMarkdown();
      setMarkdown(md);
    }
    build();
  }, [manual, userLevels, levelActions, lang]);

  if (!hasAdmin) {
    return <p>{t("accessDenied", "Access denied", { lng: lang })}</p>;
  }

  async function translate(key) {
    const mapped = headerMappings[key] || key;
    return await translateWithAI(lang, mapped, mapped);
  }

  async function buildMarkdown() {
    let md = `# ${await translateWithAI(lang, "userManual", "User Manual")}\n\n`;
    md += `## ${await translateWithAI(lang, "forms", "Forms")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.forms.length) continue;
      md += `### ${await translate(mKey)}\n`;
      md += `| ${await translateWithAI(lang, "formName", "Form Name")} | ${await translateWithAI(lang, "identifier", "Identifier")} | ${await translateWithAI(lang, "description", "Description")} |\n`;
      md += `| --- | --- | --- |\n`;
      for (const form of mod.forms) {
        const formName = await translate(form.key);
        const intro = `This form enables authorised users to manage records related to ${formName}.`;
        const desc = await translateWithAI(lang, "formIntro", intro);
        md += `| ${formName} | ${form.key} | ${desc} |\n`;
        if (form.buttons?.length) {
          md += `\n#### ${formName} ${await translateWithAI(lang, "buttons", "Buttons")}\n`;
          md += `| ${await translateWithAI(lang, "buttonName", "Button Name")} | ${await translateWithAI(lang, "identifier", "Identifier")} | ${await translateWithAI(lang, "description", "Description")} |\n`;
          md += `| --- | --- | --- |\n`;
          for (const btn of form.buttons) {
            const bKey = typeof btn === "string" ? btn : btn.key;
            const bName = await translate(bKey);
            const sentenceDefault = `The ${bName} button initiates the ${bName} operation within this form.`;
            const sentence = await translateWithAI(lang, "buttonPurposeDetail", sentenceDefault);
            md += `| ${bName} | ${bKey} | ${sentence} |\n`;
          }
        }
      }
    }

    md += `\n## ${await translateWithAI(lang, "reports", "Reports")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.reports.length) continue;
      md += `### ${await translate(mKey)}\n`;
      md += `| ${await translateWithAI(lang, "reportName", "Report Name")} | ${await translateWithAI(lang, "identifier", "Identifier")} | ${await translateWithAI(lang, "description", "Description")} |\n`;
      md += `| --- | --- | --- |\n`;
      for (const r of mod.reports) {
        const k = typeof r === "string" ? r : r.key;
        const reportName = await translate(k);
        const sentenceDefault = `The ${reportName} report provides a comprehensive overview of the associated data set, presenting information in a structured and readable manner for further analysis.`;
        const sentence = await translateWithAI(lang, "reportPurposeDetail", sentenceDefault);
        md += `| ${reportName} | ${k} | ${sentence} |\n`;
      }
    }

    md += `\n## ${await translateWithAI(lang, "settings", "Settings")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.buttons.length && !mod.functions.length) continue;
      md += `### ${await translate(mKey)}\n`;
      if (mod.buttons.length) {
        md += `#### ${await translateWithAI(lang, "buttons", "Buttons")}\n`;
        md += `| ${await translateWithAI(lang, "buttonName", "Button Name")} | ${await translateWithAI(lang, "identifier", "Identifier")} | ${await translateWithAI(lang, "description", "Description")} |\n`;
        md += `| --- | --- | --- |\n`;
        for (const b of mod.buttons) {
          const bName = await translate(b);
          const sentenceDefault = `The ${bName} button allows administrators to execute the ${bName} operation, applying the current configuration without additional mandatory fields.`;
          const sentence = await translateWithAI(lang, "settingsButtonDetail", sentenceDefault);
          md += `| ${bName} | ${b} | ${sentence} |\n`;
        }
      }
      if (mod.functions.length) {
        md += `\n#### ${await translateWithAI(lang, "functions", "Functions")}\n`;
        md += `| ${await translateWithAI(lang, "functionName", "Function Name")} | ${await translateWithAI(lang, "identifier", "Identifier")} | ${await translateWithAI(lang, "description", "Description")} |\n`;
        md += `| --- | --- | --- |\n`;
        for (const fn of mod.functions) {
          const fnName = await translate(fn);
          const sentenceDefault = `The ${fnName} function performs the ${fnName} process, leveraging the active settings to modify how the application operates.`;
          const sentence = await translateWithAI(lang, "settingsFunctionDetail", sentenceDefault);
          md += `| ${fnName} | ${fn} | ${sentence} |\n`;
        }
      }
    }

    md += `\n## ${await translateWithAI(lang, "quickReference", "Quick Reference")}\n`;
    md += `| ${await translateWithAI(lang, "userLevel", "User Level")} | ${await translateWithAI(lang, "modules", "Modules")} | ${await translateWithAI(lang, "forms", "Forms")} | ${await translateWithAI(lang, "reports", "Reports")} | ${await translateWithAI(lang, "buttons", "Buttons")} | ${await translateWithAI(lang, "functions", "Functions")} |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    for (const lvl of userLevels) {
      const acts = levelActions[lvl.id] || {};
      const moduleEntries = Object.entries(acts).filter(
        ([k]) => !["buttons", "functions", "api", "permissions"].includes(k),
      );
      const moduleCount = moduleEntries.length;
      let formsCount = 0;
      let reportsCount = 0;
      for (const [, val] of moduleEntries) {
        formsCount += Object.keys(val.forms || {}).length;
        reportsCount += Object.keys(val.reports || {}).length;
      }
      const buttonCount = Object.keys(acts.buttons || {}).length;
      const fnCount = Object.keys(acts.functions || {}).length;
      md += `| ${lvl.name || lvl.id} | ${moduleCount} | ${formsCount} | ${reportsCount} | ${buttonCount} | ${fnCount} |\n`;
    }
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
    doc.setFont("courier", "normal");
    const lines = markdown.split("\n");
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    let y = 10;
    for (const line of lines) {
      if (line.trim().startsWith("|")) {
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        const colWidth = (pageWidth - margin * 2) / cells.length;
        let x = margin;
        for (const cell of cells) {
          doc.text(cell, x, y);
          x += colWidth;
        }
      } else {
        doc.text(line, margin, y);
      }
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
      <h2>{t("userManual", "User Manual", { lng: lang })}</h2>
      <div style={{ marginBottom: "1rem" }}>
        <label>
          Language:
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            style={{ marginLeft: "0.5rem", marginRight: "1rem" }}
          >
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button onClick={exportMarkdown}>
          {t("exportMarkdown", "Export Markdown", { lng: lang })}
        </button>
        <button onClick={exportPdf} style={{ marginLeft: "0.5rem" }}>
          {t("exportPdf", "Export PDF", { lng: lang })}
        </button>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
