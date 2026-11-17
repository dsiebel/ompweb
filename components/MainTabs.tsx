"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MessageSquareText, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getFileIcon } from "./FileIcons";
import type { MainTab } from "./main-tabs";

interface Props {
  tabs: MainTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  /** Tab label; chat tabs carry their own title, files their file name. */
  labelFor?: (tab: MainTab) => string;
  /** Toolbar for the active file tab (mention, copy, download, close all...). */
  fileActions?: ReactNode;
  /**
   * The chat body. Kept mounted (hidden) while a file tab is active so the
   * live stream, composer draft and @-mention inserts survive tab switches.
   */
  chat: ReactNode;
  /** The active file tab's viewer; only this one is mounted. */
  file: ReactNode | null;
  /** Shown when no tab is open at all. */
  empty: ReactNode;
  /** With no tab open: show the chat's onboarding screen instead of the empty hint. */
  showOnboarding?: boolean;
}

function Label({ tab, labelFor }: { tab: MainTab; labelFor?: (tab: MainTab) => string }) {
  if (labelFor) return <>{labelFor(tab)}</>;
  switch (tab.kind) {
    case "chat":
      return <>{tab.title || tab.sessionId}</>;
    case "file":
      return <>{tab.label}</>;
  }
}

/** Icon per tab kind: adding a kind means one entry here. */
function TabIcon({ tab }: { tab: MainTab }) {
  switch (tab.kind) {
    case "chat":
      return <MessageSquareText size={13} strokeWidth={2} aria-hidden="true" />;
    case "file":
      return getFileIcon(tab.label, 13);
  }
}

function tabTitle(tab: MainTab, labelFor?: (tab: MainTab) => string): string {
  switch (tab.kind) {
    case "chat":
      return labelFor ? labelFor(tab) : tab.title || tab.sessionId;
    case "file":
      return tab.path;
  }
}

/**
 * The main pane: a horizontally scrollable tab strip over the body of the
 * active tab. The strip shares TabBar's visual language (same height, accent
 * underline, close button) but keeps its own semantics: every tab here is
 * content, not a right-panel navigation view.
 */
export function MainTabs({ tabs, activeTabId, onSelectTab, onCloseTab, labelFor, fileActions, chat, file, empty, showOnboarding = false }: Props) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredClose, setHoveredClose] = useState<string | null>(null);
  const active = tabs.find((tab) => tab.id === activeTabId) ?? null;

  // Keep the selected tab visible when the strip overflows.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeTabId) return;
    const selected = list.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
    if (!selected) return;
    const listRect = list.getBoundingClientRect();
    const tabRect = selected.getBoundingClientRect();
    if (tabRect.left < listRect.left) list.scrollLeft -= listRect.left - tabRect.left;
    else if (tabRect.right > listRect.right) list.scrollLeft += tabRect.right - listRect.right;
  }, [activeTabId, tabs]);

  const focusTab = (id: string) => {
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus();
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectTab(id);
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      const nextId = tabs[nextIndex].id;
      onSelectTab(nextId);
      focusTab(nextId);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onCloseTab(id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}>
      {tabs.length > 0 && (
      <div style={{ display: "flex", alignItems: "stretch", flexShrink: 0, background: "var(--bg-panel)", borderBottom: "1px solid var(--border)", minHeight: "var(--tab-height)" }}>
        <div
          ref={listRef}
          role="tablist"
          aria-label={t("mainTabs.label")}
          aria-orientation="horizontal"
          className="tabbar-scroll"
          style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", flex: 1, minWidth: 0, height: "var(--tab-height)" }}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const label = tabTitle(tab, labelFor);
            // The close button names what the tab shows, not the file's path.
            const closeLabel = tab.kind === "file" ? tab.label : label;
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className="tabbar-tab ui-focus-ring"
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-label={label}
                aria-controls="main-tab-panel"
                title={label}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(event) => handleKeyDown(event, tab.id)}
                onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: "var(--tab-height)",
                  paddingLeft: 12,
                  paddingRight: 6,
                  borderRight: "1px solid var(--border)",
                  background: isActive ? "var(--bg)" : "var(--bg-panel)",
                  cursor: "pointer",
                  fontSize: "var(--text-sm)",
                  color: isActive ? "var(--text)" : "var(--text-muted)",
                  whiteSpace: "nowrap",
                  maxWidth: 200,
                  minWidth: 80,
                  flexShrink: 0,
                  userSelect: "none",
                  position: "relative",
                  transition: `background var(--dur-fast) var(--ease-out-warm), color var(--dur-fast) var(--ease-out-warm)`,
                }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 2,
                      background: "var(--accent)",
                      borderTopLeftRadius: "var(--radius-control)",
                      borderTopRightRadius: "var(--radius-control)",
                    }}
                  />
                )}
                <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7, display: "flex", alignItems: "center" }}>
                  <TabIcon tab={tab} />
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, fontWeight: isActive ? 500 : 400 }}>
                  <Label tab={tab} labelFor={labelFor} />
                </span>
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onCloseTab(tab.id); }}
                  onKeyDown={(event) => event.stopPropagation()}
                  onMouseEnter={() => setHoveredClose(tab.id)}
                  onMouseLeave={() => setHoveredClose(null)}
                  tabIndex={isActive ? 0 : -1}
                  title={t("mainTabs.close")}
                  aria-label={t("mainTabs.closeTab", { label: closeLabel })}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: "var(--icon-control-size-compact)", height: "var(--icon-control-size-compact)",
                    background: hoveredClose === tab.id ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    borderRadius: "var(--radius-control)",
                    color: hoveredClose === tab.id ? "var(--text)" : "var(--text-dim)",
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <X size={11} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
        {fileActions}
      </div>
      )}
      <div id="main-tab-panel" role="tabpanel" aria-label={active ? tabTitle(active, labelFor) : t("mainTabs.label")} style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative", overflow: "hidden" }}>
        {active === null
          ? (showOnboarding ? chat : empty)
          : file !== null
            ? (
              <>
                <div aria-hidden="true" style={{ display: "none" }}>{chat}</div>
                {file}
              </>
            )
            : chat}
      </div>
    </div>
  );
}
