/**
 * Pure state model for the main pane's tab workspace.
 *
 * A tab is either a chat (one per session id) or a file viewer (one per
 * host + path). Everything here is side-effect free so it can be tested
 * without React; `AppShell` holds the state and `MainTabs` renders it.
 *
 * Handoff B (terminals) adds a third `kind`; every switch over `kind` in this
 * file and in `MainTabs.tsx` must stay exhaustive.
 */

import { isRecord } from "@/lib/type-guards";

export type MainTabMode = "source" | "preview" | "diff";

/** The composer for a session that does not exist yet; never persisted. */
export const NEW_CHAT_TAB_ID = "chat:new";

export interface ChatMainTab {
  kind: "chat";
  id: string;
  /** Empty for the new-session composer (`NEW_CHAT_TAB_ID`). */
  sessionId: string;
  /** Host the session belongs to; "" while the session does not exist yet. */
  hostId: string;
  /** Session title shown on the tab, refreshed whenever the tab is opened. */
  title: string;
}

export interface FileMainTab {
  kind: "file";
  id: string;
  hostId: string;
  path: string;
  label: string;
  sourceSessionId: string | null;
  sourceCwd: string | null;
  mode: MainTabMode;
}

export type MainTab = ChatMainTab | FileMainTab;

export interface MainTabsState {
  tabs: MainTab[];
  activeTabId: string | null;
}

export const EMPTY_MAIN_TABS: MainTabsState = { tabs: [], activeTabId: null };

const MODES: readonly MainTabMode[] = ["source", "preview", "diff"];

export function chatTabId(sessionId: string): string {
  return sessionId ? `chat:${sessionId}` : NEW_CHAT_TAB_ID;
}

export function fileTabId(hostId: string, path: string): string {
  return `file:${hostId}:${path}`;
}

/** Focus `id`, or add `tab` at the end when it is new. */
function upsert(state: MainTabsState, tab: MainTab): MainTabsState {
  const index = state.tabs.findIndex((candidate) => candidate.id === tab.id);
  const tabs = index >= 0
    ? state.tabs.map((candidate, i) => (i === index ? tab : candidate))
    : [...state.tabs, tab];
  return { tabs, activeTabId: tab.id };
}

export function openChatTab(state: MainTabsState, tab: Omit<ChatMainTab, "kind" | "id">): MainTabsState {
  const id = chatTabId(tab.sessionId);
  const existing = state.tabs.find((candidate) => candidate.kind === "chat" && candidate.id === id);
  // Reinstate the tab in its old position when it is already open; only the
  // title is refreshed, so an open tab never jumps to the end of the strip.
  if (existing) return { tabs: state.tabs, activeTabId: id };
  const next: ChatMainTab = { kind: "chat", id, ...tab };
  // The new-session composer is a placeholder, not a conversation: opening a
  // real session replaces it instead of stacking a second chat tab beside it.
  const base = tab.sessionId
    ? { ...state, tabs: state.tabs.filter((candidate) => candidate.id !== NEW_CHAT_TAB_ID) }
    : state;
  return upsert(base, next);
}

export function openFileTab(
  state: MainTabsState,
  tab: Omit<FileMainTab, "kind" | "id">,
): MainTabsState {
  const id = fileTabId(tab.hostId, tab.path);
  return upsert(state, { kind: "file", id, ...tab });
}

/** Follow a session the runner moved to a new id (ownership copy-on-write). */
export function moveChatTab(state: MainTabsState, oldSessionId: string, newSessionId: string): MainTabsState {
  const oldId = chatTabId(oldSessionId);
  const newId = chatTabId(newSessionId);
  if (oldId === newId) return state;
  const tabs = state.tabs.map((tab) => (tab.kind === "chat" && tab.sessionId === oldSessionId
    ? { ...tab, id: newId, sessionId: newSessionId }
    : tab));
  return { tabs, activeTabId: state.activeTabId === oldId ? newId : state.activeTabId };
}

export function activateTab(state: MainTabsState, id: string): MainTabsState {
  if (state.activeTabId === id) return state;
  if (!state.tabs.some((tab) => tab.id === id)) return state;
  return { tabs: state.tabs, activeTabId: id };
}

/** Remove a tab; a closed active tab hands focus to its neighbour. */
export function closeTab(state: MainTabsState, id: string): MainTabsState {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return state;
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  if (state.activeTabId !== id) return { tabs, activeTabId: state.activeTabId };
  const next = tabs[index] ?? tabs[index - 1] ?? null;
  return { tabs, activeTabId: next ? next.id : null };
}

/** Close every file tab, keeping chat tabs; `keepId` stays open (Close others). */
export function closeFileTabs(state: MainTabsState, keepId?: string): MainTabsState {
  const tabs = state.tabs.filter((tab) => tab.kind === "chat" || tab.id === keepId);
  if (tabs.length === state.tabs.length) return state;
  const activeTabId = tabs.some((tab) => tab.id === state.activeTabId)
    ? state.activeTabId
    : tabs[tabs.length - 1]?.id ?? null;
  return { tabs, activeTabId };
}

export function setTabMode(state: MainTabsState, id: string, mode: MainTabMode): MainTabsState {
  let changed = false;
  const tabs = state.tabs.map((tab) => {
    if (tab.id !== id || tab.kind !== "file" || tab.mode === mode) return tab;
    changed = true;
    return { ...tab, mode };
  });
  return changed ? { tabs, activeTabId: state.activeTabId } : state;
}

/** The tab with this id, if any. */
export function findTab(state: MainTabsState, id: string | null): MainTab | null {
  if (!id) return null;
  return state.tabs.find((tab) => tab.id === id) ?? null;
}

function parseTab(raw: unknown): MainTab | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "chat") {
    if (typeof raw.sessionId !== "string" || typeof raw.id !== "string" || raw.id !== chatTabId(raw.sessionId)) return null;
    return {
      kind: "chat",
      id: raw.id,
      sessionId: raw.sessionId,
      hostId: typeof raw.hostId === "string" ? raw.hostId : "",
      title: typeof raw.title === "string" ? raw.title : "",
    };
  }
  if (raw.kind === "file") {
    if (typeof raw.hostId !== "string" || typeof raw.path !== "string" || raw.path === "") return null;
    if (typeof raw.id !== "string" || raw.id !== fileTabId(raw.hostId, raw.path)) return null;
    if (typeof raw.mode !== "string" || !MODES.includes(raw.mode as MainTabMode)) return null;
    return {
      kind: "file",
      id: raw.id,
      hostId: raw.hostId,
      path: raw.path,
      label: typeof raw.label === "string" && raw.label ? raw.label : raw.path,
      sourceSessionId: typeof raw.sourceSessionId === "string" ? raw.sourceSessionId : null,
      sourceCwd: typeof raw.sourceCwd === "string" ? raw.sourceCwd : null,
      mode: raw.mode as MainTabMode,
    };
  }
  return null;
}

export interface RestoreOptions {
  /** A chat tab whose session is gone is dropped (best effort). */
  sessionExists?: (tab: ChatMainTab) => boolean;
  /** A file tab whose path is gone is dropped (best effort). */
  fileExists?: (tab: FileMainTab) => boolean;
}

/**
 * Rebuild tab state from persisted JSON. Never throws: anything unrecognised
 * is skipped, so a corrupt or stale blob degrades to fewer tabs.
 */
export function restoreMainTabs(raw: unknown, options: RestoreOptions = {}): MainTabsState {
  if (!isRecord(raw) || !Array.isArray(raw.tabs)) return EMPTY_MAIN_TABS;
  const wantedActiveId = typeof raw.activeTabId === "string" ? raw.activeTabId : null;
  const seen = new Set<string>();
  const tabs: MainTab[] = [];
  for (const candidate of raw.tabs) {
    const tab = parseTab(candidate);
    if (!tab || seen.has(tab.id)) continue;
    // The new-session composer is transient and never worth restoring.
    if (tab.kind === "chat" && tab.sessionId === "") continue;
    if (tab.kind === "chat" && options.sessionExists && !options.sessionExists(tab)) continue;
    if (tab.kind === "file" && options.fileExists && !options.fileExists(tab)) continue;
    seen.add(tab.id);
    tabs.push(tab);
  }
  if (tabs.length === 0) return EMPTY_MAIN_TABS;
  const activeTabId = wantedActiveId && seen.has(wantedActiveId)
    ? wantedActiveId
    : tabs[tabs.length - 1].id;
  return { tabs, activeTabId };
}

/** The persisted shape; the transient new-session tab is left out. */
export function serializeMainTabs(state: MainTabsState): string {
  return JSON.stringify({
    tabs: state.tabs.filter((tab) => tab.kind !== "chat" || tab.sessionId !== ""),
    activeTabId: state.activeTabId,
  });
}

/** Convenience predicate for the active tab's kind. */
export function isFileTab(tab: MainTab | null): tab is FileMainTab {
  return tab?.kind === "file";
}

export function isChatTab(tab: MainTab | null): tab is ChatMainTab {
  return tab?.kind === "chat";
}
