import assert from "node:assert/strict";
import test from "node:test";

const {
  EMPTY_MAIN_TABS,
  activateTab,
  chatTabId,
  closeFileTabs,
  closeTab,
  fileTabId,
  openChatTab,
  openFileTab,
  restoreMainTabs,
  serializeMainTabs,
  setTabMode,
  moveChatTab,
} = await import("./main-tabs.ts");

const chat = (sessionId, overrides = {}) => ({ sessionId, hostId: "local", title: sessionId, ...overrides });
const file = (path, overrides = {}) => ({
  hostId: "local",
  path,
  label: path.split("/").pop(),
  sourceSessionId: "s1",
  sourceCwd: "/work",
  mode: "source",
  ...overrides,
});

test("opening a chat tab twice keeps one tab and focuses it", () => {
  let state = openChatTab(EMPTY_MAIN_TABS, chat("a"));
  state = openChatTab(state, chat("b"));
  state = openChatTab(state, chat("a"));
  assert.deepEqual(state.tabs.map((tab) => tab.id), [chatTabId("a"), chatTabId("b")]);
  assert.equal(state.activeTabId, chatTabId("a"));
});

test("a real session replaces the new-session composer tab", () => {
  let state = openChatTab(EMPTY_MAIN_TABS, chat(""));
  assert.equal(state.tabs.length, 1);
  assert.equal(state.tabs[0].sessionId, "");
  state = openChatTab(state, chat("a"));
  assert.deepEqual(state.tabs.map((tab) => tab.sessionId), ["a"]);
  assert.equal(state.activeTabId, chatTabId("a"));
});

test("file tabs dedupe on host and path and keep their position", () => {
  let state = openChatTab(EMPTY_MAIN_TABS, chat("a"));
  state = openFileTab(state, file("/w/one.ts"));
  state = openFileTab(state, file("/w/two.ts"));
  state = openFileTab(state, file("/w/one.ts", { sourceCwd: "/other" }));
  assert.deepEqual(state.tabs.map((tab) => tab.id), [chatTabId("a"), fileTabId("local", "/w/one.ts"), fileTabId("local", "/w/two.ts")]);
  assert.equal(state.activeTabId, fileTabId("local", "/w/one.ts"));
  assert.equal(state.tabs[1].sourceCwd, "/other");
});

test("the same path on another host is another tab", () => {
  let state = openFileTab(EMPTY_MAIN_TABS, file("/w/x.ts"));
  state = openFileTab(state, file("/w/x.ts", { hostId: "remote" }));
  assert.equal(state.tabs.length, 2);
});

test("closing the active tab activates its neighbour, then the previous one", () => {
  let state = openFileTab(openFileTab(openChatTab(EMPTY_MAIN_TABS, chat("a")), file("/w/one.ts")), file("/w/two.ts"));
  state = activateTab(state, fileTabId("local", "/w/two.ts"));
  state = closeTab(state, fileTabId("local", "/w/two.ts"));
  assert.equal(state.activeTabId, fileTabId("local", "/w/one.ts"));
  state = closeTab(state, fileTabId("local", "/w/one.ts"));
  assert.equal(state.activeTabId, chatTabId("a"));
  state = closeTab(state, chatTabId("a"));
  assert.equal(state.activeTabId, null);
  assert.deepEqual(state.tabs, []);
});

test("closing an inactive tab keeps the active one", () => {
  let state = openFileTab(openChatTab(EMPTY_MAIN_TABS, chat("a")), file("/w/one.ts"));
  state = closeTab(state, chatTabId("a"));
  assert.equal(state.activeTabId, fileTabId("local", "/w/one.ts"));
});

test("a mode switch touches only the named file tab", () => {
  let state = openFileTab(openFileTab(EMPTY_MAIN_TABS, file("/w/one.ts")), file("/w/two.ts"));
  state = setTabMode(state, fileTabId("local", "/w/one.ts"), "diff");
  assert.equal(state.tabs[0].mode, "diff");
  assert.equal(state.tabs[1].mode, "source");
  assert.equal(setTabMode(state, "missing", "diff"), state);
});

test("close all file tabs keeps chats and a sane active tab", () => {
  let state = openFileTab(openChatTab(EMPTY_MAIN_TABS, chat("a")), file("/w/one.ts"));
  state = openFileTab(state, file("/w/two.ts"));
  state = closeFileTabs(state);
  assert.deepEqual(state.tabs.map((tab) => tab.kind), ["chat"]);
  assert.equal(state.activeTabId, chatTabId("a"));
  state = openFileTab(state, file("/w/one.ts"));
  state = openFileTab(state, file("/w/two.ts"));
  state = closeFileTabs(state, fileTabId("local", "/w/two.ts"));
  assert.deepEqual(state.tabs.map((tab) => tab.id), [chatTabId("a"), fileTabId("local", "/w/two.ts")]);
});

test("a moved session renames its chat tab and keeps focus", () => {
  let state = openChatTab(EMPTY_MAIN_TABS, chat("old"));
  state = moveChatTab(state, "old", "new");
  assert.deepEqual(state.tabs.map((tab) => tab.id), [chatTabId("new")]);
  assert.equal(state.activeTabId, chatTabId("new"));
});

test("persistence round-trips tabs, order and the active tab", () => {
  let state = openFileTab(openChatTab(EMPTY_MAIN_TABS, chat("a")), file("/w/one.ts", { mode: "diff" }));
  state = openChatTab(state, chat("b"));
  state = activateTab(state, fileTabId("local", "/w/one.ts"));
  const restored = restoreMainTabs(JSON.parse(serializeMainTabs(state)));
  assert.deepEqual(restored, state);
});

test("the transient new-session tab is never persisted", () => {
  const state = openChatTab(EMPTY_MAIN_TABS, chat(""));
  const stored = JSON.parse(serializeMainTabs(state));
  assert.deepEqual(stored.tabs, []);
  // Its active id would restore to nothing, so it is not stored either.
  assert.equal(stored.activeTabId, null);
});

test("restore drops a chat tab whose session is gone", () => {
  let state = openChatTab(EMPTY_MAIN_TABS, chat("gone"));
  state = openFileTab(state, file("/w/keep.ts"));
  state = activateTab(state, chatTabId("gone"));
  const restored = restoreMainTabs(JSON.parse(serializeMainTabs(state)), {
    sessionExists: (tab) => tab.sessionId !== "gone",
  });
  assert.deepEqual(restored.tabs.map((tab) => tab.id), [fileTabId("local", "/w/keep.ts")]);
  // The dropped active tab hands focus to the one that survived.
  assert.equal(restored.activeTabId, fileTabId("local", "/w/keep.ts"));
});

test("restore drops a file tab whose path is gone", () => {
  const state = openFileTab(openFileTab(EMPTY_MAIN_TABS, file("/w/keep.ts")), file("/w/gone.ts"));
  const restored = restoreMainTabs(JSON.parse(serializeMainTabs(state)), {
    fileExists: (tab) => !tab.path.endsWith("gone.ts"),
  });
  assert.deepEqual(restored.tabs.map((tab) => tab.path), ["/w/keep.ts"]);
});

test("corrupt or stale blobs degrade to fewer tabs, never throw", () => {
  assert.deepEqual(restoreMainTabs(null), EMPTY_MAIN_TABS);
  assert.deepEqual(restoreMainTabs("nope"), EMPTY_MAIN_TABS);
  assert.deepEqual(restoreMainTabs({ tabs: "no" }), EMPTY_MAIN_TABS);
  const restored = restoreMainTabs({
    tabs: [
      null,
      { kind: "chat", id: "wrong", sessionId: "a", hostId: "local" },
      { kind: "file", id: "file:local:/w/x", hostId: "local", path: "/w/x", mode: "bogus" },
      { kind: "file", id: fileTabId("local", "/w/y"), hostId: "local", path: "/w/y", label: "y", mode: "diff" },
      { kind: "file", id: fileTabId("local", "/w/y"), hostId: "local", path: "/w/y", label: "y", mode: "source" },
      { kind: "chat", id: chatTabId(""), sessionId: "", hostId: "", title: "New" },
    ],
    activeTabId: "missing",
  });
  assert.deepEqual(restored.tabs.map((tab) => tab.id), [fileTabId("local", "/w/y")]);
  assert.equal(restored.tabs[0].mode, "diff");
  assert.equal(restored.activeTabId, fileTabId("local", "/w/y"));
});
