import assert from "node:assert/strict";
import "../tests/setup-dom.mjs";
import React from "react";
import test, { afterEach } from "node:test";
// DOM and browser fakes must exist before importing Testing Library and the component.
const { render, cleanup, waitFor } = await import("@testing-library/react/pure.js");
const { FileViewer } = await import("./FileViewer.tsx");
const originalFetch = globalThis.fetch;
const originalWorker = globalThis.Worker;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; globalThis.Worker = originalWorker; delete window.matchMedia; });
function browser() {
  globalThis.Worker = class { onmessage = null; onerror = null; postMessage() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}
const props = (hostId) => ({ filePath: "/same/report.txt", cwd: "/same", hostId });

test("a file viewer renders bytes from its owning host", async () => {
  browser();
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("/api/git/")) return Response.json({ supported: false });
    const host = new URL(String(url), "http://localhost").searchParams.get("hostId");
    return Response.json({ content: host === "host-a" ? "Alpha document" : "Wrong machine", language: "text", size: 14 });
  };
  const view = render(React.createElement(FileViewer, props("host-a")));
  await waitFor(() => assert.ok(view.container.textContent.includes("Alpha document")));
});

test("an older read cannot replace the same path after its host changes", async () => {
  browser();
  let releaseAlpha;
  let started;
  const alphaStarted = new Promise((resolve) => { started = resolve; });
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("/api/git/")) return Response.json({ supported: false });
    const host = new URL(String(url), "http://localhost").searchParams.get("hostId");
    if (host === "host-b") return Response.json({ content: "Beta document", language: "text", size: 13 });
    started();
    return { ok: true, json: () => new Promise((resolve) => { releaseAlpha = () => resolve({ content: "Late alpha", language: "text", size: 10 }); }) };
  };
  const view = render(React.createElement(FileViewer, props("host-a")));
  await alphaStarted;
  view.rerender(React.createElement(FileViewer, props("host-b")));
  await waitFor(() => assert.ok(view.container.textContent.includes("Beta document")));
  releaseAlpha();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(view.container.textContent.includes("Beta document"));
  assert.ok(!view.container.textContent.includes("Late alpha"));
});

test("a requested diff survives the first render and shows the patch", async () => {
  browser();
  const modes = [];
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("/api/git/")) {
      // Resolve after a tick, as the real request does.
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ supported: true, patch: "@@ -1,1 +1,1 @@\n-old line\n+new line" });
    }
    return Response.json({ content: "new line", language: "text", size: 8 });
  };
  const view = render(React.createElement(FileViewer, {
    filePath: "/same/report.txt",
    cwd: "/same",
    hostId: "host-a",
    displayMode: "diff",
    onDisplayModeChange: (mode) => modes.push(mode),
  }));
  await waitFor(() => assert.ok(view.container.textContent.includes("new line")));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(modes, [], "a requested diff is not downgraded before the diff request answers");
  assert.ok(view.container.textContent.includes("old line"));
  assert.ok(view.container.textContent.includes("new line"));
});
