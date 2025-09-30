import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import { marked } from "marked";
import { jsPDF } from "jspdf";
import I18nContext from "../context/I18nContext.jsx";
import { AuthContext } from "../context/AuthContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import useHeaderMappings from "../hooks/useHeaderMappings.js";
import translateWithCache from "../utils/translateWithCache.js";

export default function UserManualExport() {
  const { t, lang: uiLang } = useContext(I18nContext);
  const { session } = useContext(AuthContext);
  const { addToast } = useToast();

  const [lang, setLang] = useState(uiLang);
  const languages = ["en", "mn", "ja", "ko", "zh", "es", "de", "fr", "ru"];
  const [manual, setManual] = useState({});
  const [markdown, setMarkdown] = useState("");
  const [levelActions, setLevelActions] = useState({});
  const [txFormsMap, setTxFormsMap] = useState({});
  const buttonDescMap = useRef({});
  const reportDescMap = useRef({});
  const buttonReqMap = useRef({});

  useEffect(() => {
    async function loadFormDescs() {
      try {
        const res = await fetch('/api/transaction_forms?mode=all', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const apiData = await res.json().catch(() => null);
        if (!apiData || typeof apiData !== 'object') return;
        let txForms = apiData.tables || apiData.config || null;
        if (!txForms) {
          const { isDefault: _unused, ...rest } = apiData;
          const grouped = {};
          let groupedCount = 0;
          Object.entries(rest || {}).forEach(([key, value]) => {
            if (!value || typeof value !== 'object') return;
            const tbl = value.table;
            if (!tbl) return;
            if (!grouped[tbl]) grouped[tbl] = {};
            grouped[tbl][key] = value;
            groupedCount += 1;
          });
          txForms = groupedCount > 0 ? grouped : rest;
        }
        const bMap = {}, rMap = {}, reqMap = {};
        Object.values(txForms || {}).forEach((forms) => {
          const entries = Array.isArray(forms)
            ? forms.map((f) => [typeof f === 'string' ? f : f.key, f])
            : Object.entries(forms || {});
          entries.forEach(([, cfg]) => {
            if (!cfg || typeof cfg !== 'object') return;
            if (Array.isArray(cfg.buttons)) {
              cfg.buttons.forEach((b) => {
                const bKey = typeof b === 'string' ? b : b.key;
                if (!bKey) return;
                if (b.description) bMap[bKey] = b.description;
                const rf = b.requiredFields || b.reqFields;
                if (rf) reqMap[bKey] = rf;
              });
            }
            if (Array.isArray(cfg.reports)) {
              cfg.reports.forEach((r) => {
                const rKey = typeof r === 'string' ? r : r.key;
                if (!rKey) return;
                if (r.description) rMap[rKey] = r.description;
              });
            }
          });
        });
        buttonDescMap.current = bMap;
        reportDescMap.current = rMap;
        buttonReqMap.current = reqMap;
      } catch {
        /* ignore */
      }
    }
    loadFormDescs();
  }, []);

  const hasContent = Object.values(manual).some(
    (m) =>
      m.forms.length ||
      m.reports.length ||
      m.buttons.length ||
      m.functions.length,
  );
  const noContentMsg = t(
    "noManualContent",
    "No manual content found. Check permissions or backend configuration.",
    { lng: lang },
  );

  useEffect(() => {
    if (Object.keys(manual).length && !hasContent) {
      addToast(noContentMsg, "warning");
    }
  }, [manual, hasContent, noContentMsg, addToast]);

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
              buttonReqMap.current[bKey] ||
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
            buttonReqMap.current[bKey] ||
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
        const res = await fetch(
          `/api/permissions/actions/${session.user_level}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("failedActions");
        const raw = await res.json();
        const data = { ...raw };
        Object.entries(data).forEach(([key, val]) => {
          if (!val || typeof val !== "object") return;
          if (["buttons", "functions", "api", "permissions", "modules"].includes(key))
            return;
          const forms = Array.isArray(val.forms)
            ? val.forms
            : Object.keys(val.forms || {});
          data[key] = { ...val, forms };
        });
        if (data.modules) {
          Object.entries(data.modules).forEach(([mKey, val]) => {
            const forms = Array.isArray(val.forms)
              ? val.forms
              : Object.keys(val.forms || {});
            data.modules[mKey] = { ...val, forms };
          });
        }
        setLevelActions((prev) => ({ ...prev, [session.user_level]: data }));

        const struct = {};
        const moduleKeys = new Set();
        const addModule = (k) => {
          if (!k) return;
          moduleKeys.add(k);
          if (!struct[k])
            struct[k] = { buttons: [], functions: [], forms: [], reports: [] };
        };

        const modNodes = Array.isArray(data.modules)
          ? data.modules
          : Object.values(data.modules || {});
        const visit = (nodes) =>
          nodes.forEach((m) => {
            addModule(m.key);
            if (Array.isArray(m.children) && m.children.length)
              visit(m.children);
          });
        visit(modNodes);

        const buttonObjs = Array.isArray(data.buttons)
          ? data.buttons
          : Object.values(data.buttons || {});
        const allowedButtons = new Set(
          buttonObjs.map((b) => (typeof b === "string" ? b : b.key)),
        );
        const functionObjs = Array.isArray(data.functions)
          ? data.functions
          : Object.values(data.functions || {});
        const allowedFunctions = new Set(
          functionObjs.map((fn) => (typeof fn === "string" ? fn : fn.key)),
        );
        const reportObjs = Array.isArray(data.reports)
          ? data.reports
          : Object.values(data.reports || {});
        const allowedReports = new Set(
          reportObjs.map((r) => (typeof r === "string" ? r : r.key)),
        );

        const formNodes = Array.isArray(data.forms)
          ? data.forms
          : Object.entries(data.forms || {}).map(([key, val]) => ({
              key,
              ...val,
            }));
        for (const f of formNodes) {
          const fKey = f.key;
          const mKey = f.module || f.moduleKey || "misc";
          if (!moduleKeys.has(mKey)) continue;
          addModule(mKey);

          const rawFormButtons = Array.isArray(f.buttons)
            ? f.buttons
            : Object.values(f.buttons || {});
          const formButtons = rawFormButtons.filter((b) =>
            allowedButtons.has(typeof b === "string" ? b : b.key),
          );
          const rawFormFunctions = Array.isArray(f.functions)
            ? f.functions
            : Object.values(f.functions || {});
          const formFunctions = rawFormFunctions.filter((fn) =>
            allowedFunctions.has(typeof fn === "string" ? fn : fn.key),
          );
          const rawFormReports = Array.isArray(f.reports)
            ? f.reports
            : Object.values(f.reports || {});
          const formReports = rawFormReports.filter((r) =>
            allowedReports.has(typeof r === "string" ? r : r.key),
          );

          struct[mKey].forms.push({
            key: fKey,
            ...f,
            buttons: formButtons,
            functions: formFunctions,
            reports: formReports,
          });

          formButtons.forEach((b) =>
            struct[mKey].buttons.push(typeof b === "string" ? b : b.key),
          );
          formFunctions.forEach((fn) =>
            struct[mKey].functions.push(
              typeof fn === "string" ? fn : fn.key,
            ),
          );
          formReports.forEach((r) =>
            struct[mKey].reports.push(typeof r === "string" ? r : r.key),
          );
        }

        const buttonEntries = Array.isArray(data.buttons)
          ? data.buttons.map((b) => [typeof b === "string" ? b : b.key, b])
          : Object.entries(data.buttons || {});
        for (const [bKey, bVal] of buttonEntries) {
          const mKey =
            typeof bVal === "string"
              ? null
              : bVal.module || bVal.moduleKey;
          if (mKey && moduleKeys.has(mKey)) {
            addModule(mKey);
            if (!struct[mKey].buttons.includes(bKey))
              struct[mKey].buttons.push(bKey);
          }
        }
        const fnEntries = Array.isArray(data.functions)
          ? data.functions.map((fn) => [typeof fn === "string" ? fn : fn.key, fn])
          : Object.entries(data.functions || {});
        for (const [fnKey, fnVal] of fnEntries) {
          const mKey =
            typeof fnVal === "string"
              ? null
              : fnVal.module || fnVal.moduleKey;
          if (mKey && moduleKeys.has(mKey)) {
            addModule(mKey);
            if (!struct[mKey].functions.includes(fnKey))
              struct[mKey].functions.push(fnKey);
          }
        }
        const reportEntries = Array.isArray(data.reports)
          ? data.reports.map((r) => [typeof r === "string" ? r : r.key, r])
          : Object.entries(data.reports || {});
        for (const [rKey, rVal] of reportEntries) {
          const mKey =
            typeof rVal === "string"
              ? null
              : rVal.module || rVal.moduleKey;
          if (mKey && moduleKeys.has(mKey)) {
            addModule(mKey);
            if (!struct[mKey].reports.includes(rKey))
              struct[mKey].reports.push(rKey);
          }
        }

        let tfData;
        try {
          const tfRes = await fetch("/api/transaction_forms?mode=all", {
            credentials: "include",
          });
          if (tfRes.ok) {
            const apiData = await tfRes.json().catch(() => null);
            if (apiData && typeof apiData === "object") {
              tfData = apiData.tables || apiData.config || null;
              if (!tfData) {
                const { isDefault: _unused, ...rest } = apiData;
                const grouped = {};
                let groupedCount = 0;
                Object.entries(rest || {}).forEach(([key, value]) => {
                  if (!value || typeof value !== "object") return;
                  const tbl = value.table;
                  if (!tbl) return;
                  if (!grouped[tbl]) grouped[tbl] = {};
                  grouped[tbl][key] = value;
                  groupedCount += 1;
                });
                tfData = groupedCount > 0 ? grouped : rest;
              }
            }
          }
        } catch (e) {
          // ignore, will fall back to local config
        }
        tfData = tfData || transactionForms;
        const txMap = {};
        // Merge dynamic transaction form configs so they contribute to module forms
        Object.values(tfData || {}).forEach((forms) => {
          const entries = Array.isArray(forms)
            ? forms.map((f) => [f.key, f])
            : Object.entries(forms || {});
          entries.forEach(([tName, cfg]) => {
            const mKey = cfg.moduleKey;
            if (!mKey) return;
            addModule(mKey);
            (txMap[mKey] ||= []).push(tName);
            const existing = struct[mKey].forms.find((f) => f.key === tName);
            const fields = {
              visibleFields: cfg.visibleFields || [],
              requiredFields: cfg.requiredFields || [],
            };
            if (existing) {
              existing.fields = {
                ...(existing.fields || {}),
                ...fields,
              };
            } else {
              struct[mKey].forms.push({
                key: tName,
                fields,
                buttons: [],
                functions: [],
                reports: [],
              });
            }
          });
        });

        setTxFormsMap(txMap);
        const hasManualContent = Object.values(struct).some(
          (m) =>
            m.forms.length ||
            m.reports.length ||
            m.buttons.length ||
            m.functions.length,
        );
        if (hasManualContent) {
          setManual(struct);
        } else {
          addToast(noContentMsg, "warning");
        }
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
    if (!hasContent) {
      setMarkdown("");
      return;
    }
    async function build() {
      const md = await buildMarkdown();
      setMarkdown(md);
    }
    build();
  }, [manual, lang, session, hasContent]);

  if (!session) {
    return <p>{t("accessDenied", "Access denied", { lng: lang })}</p>;
  }

  const translateLabel = async (key, fallback, meta) => {
    const result = await translateWithCache(lang, key, fallback, meta);
    if (!result) return fallback ?? "";
    return result.text ?? (fallback ?? "");
  };

  async function translate(key) {
    if (!key) return "";
    if (headerMap[key]) return headerMap[key];
    return translateLabel(key);
  }

  async function buildMarkdown() {
    let md = `# ${await translateLabel("userManual", "User Manual")}\n\n`;
    md += `## ${await translateLabel("forms", "Forms")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.forms.length) continue;
      md += `### ${await translate(mKey)}\n`;
      for (const form of mod.forms) {
        const formName = await translate(form.key);
        md += `#### ${formName}\n`;
        const rf = form.fields?.requiredFields || [];
        if (rf.length) {
          const rfNames = await Promise.all(rf.map((r) => translate(r)));
          md += `${await translateLabel("requiredFields", "Required Fields")}: ${rfNames.join(", ")}\n`;
        }
        const actions = [];
        (form.buttons || []).forEach((b) =>
          actions.push(typeof b === "string" ? b : b.key),
        );
        (form.functions || []).forEach((fn) =>
          actions.push(typeof fn === "string" ? fn : fn.key),
        );
        for (const a of actions) {
          const aName = await translate(a);
          md += `- ${aName}\n`;
        }
      }
    }

    md += `\n## ${await translateLabel("reports", "Reports")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.reports.length) continue;
      md += `### ${await translate(mKey)}\n`;
      md += `| ${await translateLabel("reportName", "Report Name")} | ${await translateLabel("identifier", "Identifier")} | ${await translateLabel("description", "Description")} |\n`;
      md += `| --- | --- | --- |\n`;
      for (const r of mod.reports) {
          const k = typeof r === "string" ? r : r.key;
          const reportName = await translate(k);
          let rDesc =
            (typeof r === "object" && r.description) ||
            reportDescMap.current[k] ||
            (() => {
              const tr = t(`manual.${k}.description`, "", { lng: lang });
              return tr && tr !== `manual.${k}.description` ? tr : null;
            })();
          if (!rDesc) {
            const sentenceDefault = `The ${reportName} report provides a comprehensive overview of the associated data set, presenting information in a structured and readable manner for further analysis.`;
            rDesc = await translateLabel("reportPurposeDetail", sentenceDefault);
          }
          md += `| ${reportName} | ${k} | ${rDesc} |\n`;
      }
    }

    md += `\n## ${await translateLabel("settings", "Settings")}\n`;
    for (const [mKey, mod] of Object.entries(manual)) {
      if (!mod.buttons.length && !mod.functions.length) continue;
      md += `### ${await translate(mKey)}\n`;
      if (mod.buttons.length) {
        md += `#### ${await translateLabel("buttons", "Buttons")}\n`;
        md += `| ${await translateLabel("buttonName", "Button Name")} | ${await translateLabel("identifier", "Identifier")} | ${await translateLabel("description", "Description")} |\n`;
        md += `| --- | --- | --- |\n`;
        for (const b of mod.buttons) {
          const bName = await translate(b);
          let reqFields = buttonReqMap.current[b] || [];
          let bDesc =
            buttonDescMap.current[b] ||
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
            bDesc = await translateLabel("settingsButtonDetail", sentenceDefault);
          }
          md += `| ${bName} | ${b} | ${bDesc} |\n`;
        }
      }
      if (mod.functions.length) {
        md += `\n#### ${await translateLabel("functions", "Functions")}\n`;
        md += `| ${await translateLabel("functionName", "Function Name")} | ${await translateLabel("identifier", "Identifier")} | ${await translateLabel("description", "Description")} |\n`;
        md += `| --- | --- | --- |\n`;
        for (const fn of mod.functions) {
          const fnName = await translate(fn);
          const sentenceDefault = `The ${fnName} function performs the ${fnName} process, leveraging the active settings to modify how the application operates.`;
          const sentence = await translateLabel("settingsFunctionDetail", sentenceDefault);
          md += `| ${fnName} | ${fn} | ${sentence} |\n`;
        }
      }
    }

    md += `\n## ${await translateLabel("quickReference", "Quick Reference")}\n`;
    md += `| ${await translateLabel("userLevel", "User Level")} | ${await translateLabel("modules", "Modules")} | ${await translateLabel("forms", "Forms")} | ${await translateLabel("reports", "Reports")} | ${await translateLabel("buttons", "Buttons")} | ${await translateLabel("functions", "Functions")} |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    const lvl = { id: session?.user_level };
    const acts = levelActions[lvl.id] || {};
    const moduleKeys = acts.modules
      ? Object.keys(acts.modules)
      : Object.keys(acts).filter((k) =>
          !["buttons", "functions", "api", "permissions"].includes(k),
        );
      const moduleCount = moduleKeys.length;
      const formsCount = moduleKeys.reduce((n, k) => {
        const val = acts.modules?.[k] || acts[k] || {};
        const baseForms = Array.isArray(val.forms)
          ? val.forms.map((f) => (typeof f === "string" ? f : f.key))
          : Object.keys(val.forms || {});
        const forms = Array.from(
          new Set([...baseForms, ...(txFormsMap[k] || [])]),
        );
        return n + forms.length;
      }, 0);
    const reportsCount = moduleKeys.reduce(
      (n, k) => n + (manual[k]?.reports.length || 0),
      0,
    );
    const buttonCount = Object.keys(acts.buttons || {}).length;
    const fnCount = Object.keys(acts.functions || {}).length;
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

  const html = hasContent ? marked.parse(markdown) : "";

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
        {hasContent && (
          <>
            <button onClick={exportMarkdown}>
              {t("exportMarkdown", "Export Markdown", { lng: lang })}
            </button>
            <button onClick={exportPdf} style={{ marginLeft: "0.5rem" }}>
              {t("exportPdf", "Export PDF", { lng: lang })}
            </button>
          </>
        )}
      </div>
      {hasContent ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p>{noContentMsg}</p>
      )}
    </div>
  );
}
