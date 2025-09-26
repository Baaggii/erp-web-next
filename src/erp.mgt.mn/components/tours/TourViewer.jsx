import React, { useMemo } from "react";

const overlayStyles = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1.5rem",
  zIndex: 9999,
};

const panelStyles = {
  width: "320px",
  maxWidth: "90vw",
  maxHeight: "80vh",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.3)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  border: "1px solid rgba(15, 23, 42, 0.12)",
};

const headerStyles = {
  padding: "1rem 1.25rem",
  borderBottom: "1px solid rgba(148, 163, 184, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const listStyles = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  overflowY: "auto",
};

const listItemStyles = {
  borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
};

const buttonStyles = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "transparent",
  border: "none",
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  color: "#0f172a",
  fontSize: "0.95rem",
  cursor: "pointer",
  textAlign: "left",
};

const activeButtonStyles = {
  backgroundColor: "rgba(59, 130, 246, 0.1)",
  color: "#1d4ed8",
  fontWeight: 600,
};

const footerStyles = {
  padding: "0.75rem 1.25rem",
  borderTop: "1px solid rgba(148, 163, 184, 0.4)",
  display: "flex",
  justifyContent: "flex-end",
};

const closeButtonStyles = {
  padding: "0.5rem 0.85rem",
  borderRadius: "6px",
  border: "1px solid rgba(148, 163, 184, 0.7)",
  backgroundColor: "#f8fafc",
  color: "#0f172a",
  fontSize: "0.85rem",
  cursor: "pointer",
};

const emptyStateStyles = {
  padding: "2rem 1.5rem",
  textAlign: "center",
  color: "#475569",
  fontSize: "0.9rem",
};

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.map((step, index) => ({
    ...step,
    __index: index,
  }));
}

export default function TourViewer({ state, onClose, onSelectStep }) {
  const steps = useMemo(() => normalizeSteps(state?.steps), [state?.steps]);
  const activeIndex = useMemo(() => {
    if (typeof state?.currentStepIndex !== "number") return null;
    if (!Number.isFinite(state.currentStepIndex)) return null;
    if (!steps.length) return null;
    const clamped = Math.min(Math.max(state.currentStepIndex, 0), steps.length - 1);
    return clamped;
  }, [state?.currentStepIndex, steps.length]);

  if (!state) return null;

  const title = state?.title || state?.pageKey || "Tour";
  const subtitle = state?.path ? `Path: ${state.path}` : null;

  const handleSelect = (index) => {
    if (typeof onSelectStep !== "function") return;
    if (typeof index !== "number" || Number.isNaN(index)) return;
    onSelectStep(index);
  };

  return (
    <div style={overlayStyles} role="dialog" aria-modal="true">
      <div style={panelStyles}>
        <div style={headerStyles}>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#0f172a" }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>{subtitle}</div>
            )}
          </div>
          <button type="button" onClick={onClose} style={closeButtonStyles}>
            Close
          </button>
        </div>
        {steps.length ? (
          <ul style={listStyles}>
            {steps.map((step) => {
              const index = step.__index;
              const displayTitle =
                typeof step.title === "string" && step.title.trim()
                  ? step.title.trim()
                  : `Step ${index + 1}`;
              const isActive = activeIndex === index;
              return (
                <li key={step.id || index} style={listItemStyles}>
                  <button
                    type="button"
                    onClick={() => handleSelect(index)}
                    style={{
                      ...buttonStyles,
                      ...(isActive ? activeButtonStyles : null),
                    }}
                  >
                    <span style={{
                      minWidth: "2rem",
                      height: "2rem",
                      borderRadius: "9999px",
                      backgroundColor: isActive ? "#bfdbfe" : "#e2e8f0",
                      color: "#1e293b",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}>
                      {index + 1}
                    </span>
                    <span>{displayTitle}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div style={emptyStateStyles}>No steps available for this tour.</div>
        )}
        <div style={footerStyles}>
          <button type="button" onClick={onClose} style={closeButtonStyles}>
            Close viewer
          </button>
        </div>
      </div>
    </div>
  );
}
