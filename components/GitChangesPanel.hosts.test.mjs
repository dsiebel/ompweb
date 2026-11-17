import "../tests/setup-dom.mjs";
import assert from "node:assert/strict";
import React from "react";
import test, { afterEach } from "node:test";
const { render, cleanup, waitFor } = await import("@testing-library/react/pure.js");
const { GitChangesPanel } = await import("./GitChangesPanel.tsx");
const originalFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test("the changes list opens the file it lists, on this host, instead of rendering a diff", async () => {
  const opened = [];
  const requested = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    requested.push(url.pathname);
    assert.equal(url.pathname, "/api/git/status");
    return Response.json({
      isGitRepository: true,
      repositoryRoot: "/same",
      files: [{ filePath: "/same/report.txt", status: "modified", code: "M", indexStatus: " ", worktreeStatus: "M" }],
    });
  };
  const view = render(React.createElement(GitChangesPanel, {
    cwd: "/same",
    hostId: "host-a",
    sourceSessionId: null,
    onOpenFile: (path, name, sessionId) => opened.push([path, name, sessionId]),
  }));
  const row = await waitFor(() => {
    const found = view.getByRole("option");
    assert.ok(found);
    return found;
  });
  row.click();
  assert.deepEqual(opened, [["/same/report.txt", "report.txt", null]]);
  // No patch is fetched or rendered in the panel any more.
  assert.deepEqual(requested, ["/api/git/status"]);
  assert.equal(view.container.textContent.includes("@@"), false);
});
