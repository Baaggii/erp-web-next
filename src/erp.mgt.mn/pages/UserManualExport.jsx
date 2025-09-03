import React, { useState, useEffect, useContext, useMemo } from "react";
import { marked } from "marked";
import { jsPDF } from "jspdf";
import I18nContext from "../context/I18nContext.jsx";
import { AuthContext } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import useHeaderMappings from "../hooks/useHeaderMappings.js";
import translateWithAI from "../utils/translateWithAI.js";
import transactionForms from "../../../config/transactionForms.json";

const formDescMap = {};
const buttonDescMap = {};
const reportDescMap = {};
const buttonReqMap = {};

Object.values(transactionForms || {}).forEach((forms) => {
  Object.entries(forms || {}).forEach(([fKey, cfg]) => {
    if (cfg.description) formDescMap[fKey] = cfg.description;
    if (Array.isArray(cfg.buttons)) {
      cfg.buttons.forEach((b) => {
        const bKey = typeof b === "string" ? b : b.key;
        if (!bKey) return;
        if (b.description) buttonDescMap[bKey] = b.description;
        const rf = b.requiredFields || b.reqFields;
        if (rf) buttonReqMap[bKey] = rf;
      });
    }
    if (Array.isArray(cfg.reports)) {
      cfg.reports.forEach((r) => {
        const rKey = typeof r === "string" ? r : r.key;
        if (!rKey) return;
        if (r.description) reportDescMap[rKey] = r.description;
      });
    }
  });
});

export default function UserManualExport() {
  const { t, lang: uiLang } = useContext(I18nContext);
  const { session } = useContext(AuthContext);
  const { addToast } = useToast();

  const [lang, setLang] = useState(uiLang);
  const languages = ["en", "mn", "ja", "ko", "zh", "es", "de", "fr", "ru"];
  const [manual, setManual] = useState({});
  const [markdown, setMarkdown] = useState("");

  const headerKeys = useMemo(() => {
    const keys = new Set();
    Object.entries(manual || {}).forEach(([mKey, mod]) => {
      keys.add(mKey);
      (mod.forms || []).forEach((form) => {
        if (form.key) keys.add(form.key);
        (form.buttons || []).forEach((btn) => {
          const bKey = typeof btn === "string" ? btn : btn.key;
          if (bKey) {
            keys.add(bKey);
            const rf =
              (typeof btn === "object" &&
                (btn.requiredFields || btn.reqFields)) ||
              buttonReqMap[bKey] ||
              [];
            (rf || []).forEach((f) => keys.add(f));
          }
        });
        (form.functions || []).forEach((fn) => {
          const fKey = typeof fn === "string" ? fn : fn.key;
          if (fKey) keys.add(fKey);
        });
        (form.reports || []).forEach((r) => {
          const rKey = typeof r === "string" ? r : r.key;
          if (rKey) keys.add(rKey);
        });
      });
      (mod.buttons || []).forEach((b) => {
        const bKey = typeof b === "string" ? b : b.key;
        if (bKey) {
          keys.add(bKey);
          const rf =
            (typeof b === "object" && (b.requiredFields || b.reqFields)) ||
            buttonReqMap[bKey] ||
            [];
          (rf || []).forEach((f) => keys.add(f));
        }
      });
      (mod.functions || []).forEach((fn) => {
        const fKey = typeof fn === "string" ? fn : fn.key;
        if (fKey) keys.add(fKey);
      });
      (mod.reports || []).forEach((r) => {
        const rKey = typeof r === "string" ? r : r.key;
        if (rKey) keys.add(rKey);
      });
    });
    return Array.from(keys);
  }, [manual]);

  const headerMap = useHeaderMappings(headerKeys, lang);

  useEffect(() => {
    async function load() {
      if (!session?.user_level) return;
      try {
        const res = await fetch(`/api/permissions/actions/${session.user_level}`, {
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
          if (!(data.modules || []).some((m) => m.key === mKey)) continue;
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
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user_level]);

  useEffect(() => {
    async function build() {
      const md = await buildMarkdown();
      setMarkdown(md);
    }
    build();
  }, [manual, lang, session]);

  if (!session) {
    return <p>{t("accessDenied", "Access denied", { lng: lang })}</p>;
  }

  function describe(key) {
    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async function translate(key) {
    if (!key) return "";
    if (headerMap[key]) return headerMap[key];
    const tr = t(key, "", { lng: lang });
    if (tr && tr !== key) return tr;
    return describe(key);
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
        let formDesc =
          form.description ||
          formDescMap[form.key] ||
          (() => {
            const tr = t(`manual.${form.key}.description`, "", { lng: lang });
            return tr && tr !== `manual.${form.key}.description` ? tr : null;
          })();
        if (!formDesc) {
          const intro = `This form enables authorised users to manage records related to ${formName}.`;
          formDesc = await translateWithAI(lang, "formIntro", intro);
        }
        md += `| ${formName} | ${form.key} | ${formDesc} |\n`;
        if (form.buttons?.length) {
          md += `\n#### ${formName} ${await translateWithAI(lang, "buttons", "Buttons")}\n`;
          md += `| ${await translateWithAI(lang, "buttonName", "Button Name")} | ${await translateWithAI(lang, "identifier", "Identifier")} | ${await translateWithAI(lang, "description", "Description")} |\n`;
          md += `| --- | --- | --- |\n`;
          for (const btn of form.buttons) {
            const bKey = typeof btn === "string" ? btn : btn.key;
            const bName = await translate(bKey);
            let reqFields = [];
            if (typeof btn === "object") {
              reqFields = btn.requiredFields || btn.reqFields || [];
            } else if (buttonReqMap[bKey]) {
              reqFields = buttonReqMap[bKey];
            }
            let bDesc =
              (typeof btn === "object" && btn.description) ||
              buttonDescMap[bKey] ||
              (() => {
                const tr = t(`manual.${bKey}.description`, "", { lng: lang });
                return tr && tr !== `manual.${bKey}.description` ? tr : null;
              })();
            let sentenceDefault = `The ${bName} button initiates the ${bName} operation within this form.`;
            if (reqFields.length) {
              const rfNames = await Promise.all(reqFields.map((r) => translate(r)));
              sentenceDefault += ` Requires: ${rfNames.join(", ")}.`;
            }
            if (!bDesc) {
              bDesc = await translateWithAI(lang, "buttonPurposeDetail", sentenceDefault);
            }
            md += `| ${bName} | ${bKey} | ${bDesc} |\n`;
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
          let rDesc =
            (typeof r === "object" && r.description) ||
            reportDescMap[k] ||
            (() => {
              const tr = t(`manual.${k}.description`, "", { lng: lang });
              return tr && tr !== `manual.${k}.description` ? tr : null;
            })();
          if (!rDesc) {
            const sentenceDefault = `The ${reportName} report provides a comprehensive overview of the associated data set, presenting information in a structured and readable manner for further analysis.`;
            rDesc = await translateWithAI(lang, "reportPurposeDetail", sentenceDefault);
          }
          md += `| ${reportName} | ${k} | ${rDesc} |\n`;
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
          let reqFields = buttonReqMap[b] || [];
          let bDesc =
            buttonDescMap[b] ||
            (() => {
              const tr = t(`manual.${b}.description`, "", { lng: lang });
              return tr && tr !== `manual.${b}.description` ? tr : null;
            })();
          let sentenceDefault = `The ${bName} button allows administrators to execute the ${bName} operation, applying the current configuration without additional mandatory fields.`;
          if (reqFields.length) {
            const rfNames = await Promise.all(reqFields.map((r) => translate(r)));
            sentenceDefault = `The ${bName} button allows administrators to execute the ${bName} operation. Requires: ${rfNames.join(", ")}.`;
          }
          if (!bDesc) {
            bDesc = await translateWithAI(lang, "settingsButtonDetail", sentenceDefault);
          }
          md += `| ${bName} | ${b} | ${bDesc} |\n`;
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
    const moduleCount = Object.keys(manual).length;
    let formsCount = 0;
    let reportsCount = 0;
    let buttonCount = 0;
    let fnCount = 0;
    for (const mod of Object.values(manual)) {
      formsCount += mod.forms.length;
      reportsCount += mod.reports.length;
      buttonCount += mod.buttons.length;
      fnCount += mod.functions.length;
    }
    md += `| ${session?.user_level_name || session?.user_level || ""} | ${moduleCount} | ${formsCount} | ${reportsCount} | ${buttonCount} | ${fnCount} |\n`;
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
