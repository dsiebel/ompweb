import "../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import React from "react";
const { cleanup, fireEvent, render, screen } = await import("@testing-library/react/pure.js");

const { MainTabs } = await import("./MainTabs.tsx");
const { chatTabId, fileTabId } = await import("./main-tabs.ts");

beforeEach(() => {
  globalThis.CSS ??= { escape: (value) => value };
});

afterEach(cleanup);

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const tabs = [
  { kind: "chat", id: chatTabId("s1"), sessionId: "s1", hostId: "local", title: "First session" },
  { kind: "file", id: fileTabId("local", "/work/a.ts"), hostId: "local", path: "/work/a.ts", label: "a.ts", sourceSessionId: "s1", sourceCwd: "/work", mode: "source" },
  { kind: "file", id: fileTabId("local", "/work/b.ts"), hostId: "local", path: "/work/b.ts", label: "b.ts", sourceSessionId: "s1", sourceCwd: "/work", mode: "diff" },
];

test("the strip lists every tab and marks only the active one selected", () => {
  render(React.createElement(MainTabs, {
    tabs,
    activeTabId: tabs[1].id,
    onSelectTab: () => {},
    onCloseTab: () => {},
    chat: React.createElement("div", { "data-testid": "chat" }, "chat"),
    renderFile: (tab, active) => React.createElement("div", { "data-testid": `file-${tab.id}`, "data-active": active }, tab.label),
    empty: React.createElement("div", { "data-testid": "empty" }, "empty"),
  }));

  const rendered = screen.getAllByRole("tab");
  assert.deepEqual(rendered.map((tab) => tab.getAttribute("data-tab-id")), tabs.map((tab) => tab.id));
  assert.equal(screen.getByRole("tab", { name: "/work/a.ts" }).getAttribute("aria-selected"), "true");
  assert.equal(screen.getByRole("tab", { name: "First session" }).getAttribute("aria-selected"), "false");
  // One panel holds every open tab's body: the active file tab is visible,
  // the other file tab and the chat stay mounted but hidden (they keep their
  // rendered content and scroll until the user comes back).
  assert.equal(screen.getAllByRole("tabpanel").length, 1);
  assert.equal(screen.getByRole("tabpanel").getAttribute("aria-label"), "/work/a.ts");
  assert.equal(screen.getByTestId(`file-${tabs[1].id}`).getAttribute("data-active"), "true");
  assert.equal(screen.getByTestId(`file-${tabs[2].id}`).getAttribute("data-active"), "false");
  assert.notEqual(screen.getByTestId(`file-${tabs[2].id}`).closest("[aria-hidden=\"true\"]"), null);
  const chat = screen.getByTestId("chat");
  assert.notEqual(chat.closest("[aria-hidden=\"true\"]"), null);
  assert.equal(screen.queryByTestId("empty"), null);
});

test("with a chat tab active the chat body is visible and no viewer mounts", () => {
  render(React.createElement(MainTabs, {
    tabs,
    activeTabId: tabs[0].id,
    onSelectTab: () => {},
    onCloseTab: () => {},
    chat: React.createElement("div", { "data-testid": "chat" }, "chat"),
    renderFile: (tab, active) => React.createElement("div", { "data-testid": `file-${tab.id}`, "data-active": active }, tab.label),
    empty: React.createElement("div", { "data-testid": "empty" }, "empty"),
  }));
  assert.ok(screen.getByTestId("chat"));
  assert.equal(screen.getByTestId("chat").closest("[aria-hidden=\"true\"]"), null);
  // File viewers stay mounted while the chat is shown, just hidden.
  assert.equal(screen.getByTestId(`file-${tabs[1].id}`).getAttribute("data-active"), "false");
  assert.notEqual(screen.getByTestId(`file-${tabs[1].id}`).closest("[aria-hidden=\"true\"]"), null);
});

test("clicking a tab activates it, arrows move the roving focus, the close button closes", async () => {
  const selected = [];
  const closed = [];
  render(React.createElement(MainTabs, {
    tabs,
    activeTabId: tabs[0].id,
    onSelectTab: (id) => selected.push(id),
    onCloseTab: (id) => closed.push(id),
    chat: React.createElement("div", { "data-testid": "chat" }, "chat"),
    renderFile: (tab) => React.createElement("div", null, tab.label),
    empty: null,
  }));

  fireEvent.click(screen.getByRole("tab", { name: "/work/b.ts" }));
  assert.deepEqual(selected, [tabs[2].id]);

  const first = screen.getByRole("tab", { name: "First session" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  await nextFrame();
  assert.deepEqual(selected, [tabs[2].id, tabs[1].id]);
  assert.equal(document.activeElement, screen.getByRole("tab", { name: "/work/a.ts" }));

  fireEvent.click(screen.getByRole("button", { name: "Close a.ts" }));
  assert.deepEqual(closed, [tabs[1].id]);
  // Clicking close must not also select the tab behind it.
  assert.deepEqual(selected, [tabs[2].id, tabs[1].id]);
});

test("with no tab open the empty hint renders instead of the chat", () => {
  render(React.createElement(MainTabs, {
    tabs: [],
    activeTabId: null,
    onSelectTab: () => {},
    onCloseTab: () => {},
    chat: React.createElement("div", { "data-testid": "chat" }, "chat"),
    renderFile: () => null,
    empty: React.createElement("div", { "data-testid": "empty" }, "empty"),
    showOnboarding: false,
  }));
  assert.equal(screen.queryAllByRole("tab").length, 0);
  assert.ok(screen.getByTestId("empty"));
  assert.equal(screen.queryByTestId("chat"), null);
});

test("with nothing selected at all the chat keeps the onboarding screen", () => {
  render(React.createElement(MainTabs, {
    tabs: [],
    activeTabId: null,
    onSelectTab: () => {},
    onCloseTab: () => {},
    chat: React.createElement("div", { "data-testid": "chat" }, "chat"),
    renderFile: () => null,
    empty: React.createElement("div", { "data-testid": "empty" }, "empty"),
    showOnboarding: true,
  }));
  assert.ok(screen.getByTestId("chat"));
  assert.equal(screen.queryByTestId("empty"), null);
});
