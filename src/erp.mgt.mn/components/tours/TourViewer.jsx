import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";

const VIEWPORT_MARGIN = 16;
const DEFAULT_WIDTH = 320;
const DEFAULT_TOP = 96;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getInitialPosition = () => {
  if (typeof window === "undefined") {
    return { top: DEFAULT_TOP, left: 0 };
  }
  return {
    top: DEFAULT_TOP,
    left: Math.max(VIEWPORT_MARGIN, window.innerWidth - DEFAULT_WIDTH - VIEWPORT_MARGIN),
  };
};

const wrapperBaseStyles = {
  position: "fixed",
  zIndex: 999,
  pointerEvents: "auto",
};

const panelStyles = {
  width: `${DEFAULT_WIDTH}px`,
  maxWidth: "90vw",
  maxHeight: "80vh",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.3)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  border: "1px solid rgba(15, 23, 42, 0.12)",
  position: "relative",
};

const headerStyles = {
  padding: "1rem 1.25rem",
  borderBottom: "1px solid rgba(148, 163, 184, 0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  cursor: "move",
};

const headerActionsStyles = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const actionButtonStyles = {
  padding: "0.35rem 0.65rem",
  borderRadius: "6px",
  border: "1px solid rgba(148, 163, 184, 0.7)",
  backgroundColor: "#f1f5f9",
  color: "#0f172a",
  fontSize: "0.75rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
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

const collapsedTabBaseStyles = {
  position: "fixed",
  zIndex: 998,
  backgroundColor: "#1d4ed8",
  color: "#ffffff",
  padding: "0.75rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  writingMode: "vertical-rl",
  textOrientation: "mixed",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.25)",
  cursor: "pointer",
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

  const panelRef = useRef(null);
  const dragStateRef = useRef(null);
  const [side, setSide] = useState("right");
  const [position, setPosition] = useState(() => getInitialPosition());
  const positionRef = useRef(position);
  const [isCollapsed, setIsCollapsed] = useState(false);

  positionRef.current = position;

  const updatePosition = useCallback((nextTop, nextLeft, dimensions) => {
    if (typeof window === "undefined") return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = dimensions?.width ?? panelRef.current?.offsetWidth ?? DEFAULT_WIDTH;
    const height = dimensions?.height ?? panelRef.current?.offsetHeight ?? 480;
    const clampedTop = clamp(
      nextTop,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN)
    );
    const clampedLeft = clamp(
      nextLeft,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
    );
    setPosition({ top: clampedTop, left: clampedLeft });
  }, []);

  const applyDockedPosition = useCallback(
    (targetSide) => {
      if (typeof window === "undefined") return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.innerHeight;
      const desiredTop = clamp(
        positionRef.current.top ?? DEFAULT_TOP,
        VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, viewportHeight - rect.height - VIEWPORT_MARGIN)
      );
      const desiredLeft =
        targetSide === "right"
          ? window.innerWidth - rect.width - VIEWPORT_MARGIN
          : VIEWPORT_MARGIN;
      updatePosition(desiredTop, desiredLeft, rect);
    },
    [updatePosition]
  );

  useEffect(() => {
    if (isCollapsed) return;
    applyDockedPosition(side);
  }, [side, isCollapsed, applyDockedPosition]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      updatePosition(positionRef.current.top, positionRef.current.left, rect);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updatePosition]);

  const handleDragMove = useCallback(
    (event) => {
      const dragData = dragStateRef.current;
      if (!dragData) return;
      event.preventDefault();
      const deltaX = event.clientX - dragData.startX;
      const deltaY = event.clientY - dragData.startY;
      const nextTop = dragData.startTop + deltaY;
      const nextLeft = dragData.startLeft + deltaX;
      updatePosition(nextTop, nextLeft, dragData.dimensions);
    },
    [updatePosition]
  );

  const endDrag = useCallback(() => {
    dragStateRef.current = null;
    if (typeof window === "undefined") return;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", endDrag);
  }, [handleDragMove]);

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return;
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", endDrag);
    };
  }, [handleDragMove, endDrag]);

  const startDrag = useCallback(
    (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("button")) return;
      if (typeof window === "undefined") return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startTop: positionRef.current.top,
        startLeft: positionRef.current.left,
        dimensions: { width: rect.width, height: rect.height },
      };
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", endDrag);
      event.preventDefault();
    },
    [handleDragMove, endDrag]
  );

  const toggleSide = useCallback(() => {
    setSide((prev) => (prev === "right" ? "left" : "right"));
  }, []);

  const handleCollapseToggle = useCallback(() => {
    if (dragStateRef.current) {
      endDrag();
    }
    setIsCollapsed((prev) => !prev);
  }, [endDrag]);

  const handleSelect = (index) => {
    if (typeof onSelectStep !== "function") return;
    if (typeof index !== "number" || Number.isNaN(index)) return;
    onSelectStep(index);
  };

  const wrapperStyles = {
    ...wrapperBaseStyles,
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  const collapsedTabStyles = {
    ...collapsedTabBaseStyles,
    top: `${position.top}px`,
    ...(side === "right"
      ? { right: "1rem", borderRadius: "8px 0 0 8px" }
      : { left: "1rem", borderRadius: "0 8px 8px 0" }),
  };

  return (
    <>
      {isCollapsed ? (
        <button
          type="button"
          onClick={handleCollapseToggle}
          style={collapsedTabStyles}
          aria-label={`Reopen ${title} viewer`}
        >
          {title}
        </button>
      ) : (
        <div ref={panelRef} style={wrapperStyles} role="dialog" aria-modal={false}>
          <div style={panelStyles}>
            <div style={headerStyles} onMouseDown={startDrag}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 600, color: "#0f172a" }}>{title}</div>
                {subtitle && (
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>{subtitle}</div>
                )}
              </div>
              <div style={headerActionsStyles}>
                <button type="button" onClick={toggleSide} style={actionButtonStyles}>
                  Dock {side === "right" ? "left" : "right"}
                </button>
                <button type="button" onClick={handleCollapseToggle} style={actionButtonStyles}>
                  Collapse
                </button>
                <button type="button" onClick={onClose} style={closeButtonStyles}>
                  Close
                </button>
              </div>
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
                        <span
                          style={{
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
                          }}
                        >
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
      )}
    </>
  );
}
