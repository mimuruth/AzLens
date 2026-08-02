import { test, expect } from "@playwright/test";

/**
 * UI-only end-to-end flows — no model provider or MCP server required. Each
 * test runs in a fresh browser context (clean localStorage), so the app starts
 * with a single seeded "New chat".
 */

test("loads with the greeting and composer", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /how can i help you today/i })
  ).toBeVisible();
  await expect(page.getByPlaceholder("Message AzLens…")).toBeVisible();
  // The agent picker is always available (it needs no API key).
  await expect(page.locator("select.agent-picker")).toBeVisible();
});

test("creates a new chat from the sidebar", async ({ page }) => {
  await page.goto("/");
  const items = page.locator(".chat-item");
  await expect(items).toHaveCount(1);
  await page.getByRole("button", { name: "New chat" }).first().click();
  await expect(page.locator(".chat-item")).toHaveCount(2);
});

test("opens the command palette and filters actions", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");
  const paletteInput = page.getByPlaceholder("Search chats or run a command…");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("toggle");
  await expect(page.getByText("Toggle dark mode")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paletteInput).toBeHidden();
});

test("saves per-conversation instructions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instructions" }).click();
  const box = page.getByPlaceholder(/Always answer in TypeScript/i);
  await expect(box).toBeVisible();
  await box.fill("Answer in French.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Reopen — the saved text should be restored.
  await page.getByRole("button", { name: "Instructions" }).click();
  await expect(
    page.getByPlaceholder(/Always answer in TypeScript/i)
  ).toHaveValue("Answer in French.");
});

test("toggles a composer mode chip", async ({ page }) => {
  await page.goto("/");
  const chip = page.locator("button.mode-chip", { hasText: "Deep Research" });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
});

test("sidebar feature activates the matching composer mode", async ({
  page,
}) => {
  await page.goto("/");
  const chip = page.locator("button.mode-chip", { hasText: "Deep Research" });
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await page
    .locator("button.feature-item", { hasText: "Deep Research" })
    .click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByPlaceholder("Message AzLens…")).toHaveValue(
    /deep research/i
  );
});

test("opens the artifacts panel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Artifacts" }).click();
  await expect(page.getByText(/No artifacts yet/i)).toBeVisible();
  await page.getByRole("button", { name: "Close artifacts" }).click();
  await expect(page.getByText(/No artifacts yet/i)).toBeHidden();
});

test("creates and opens a project", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Manage" }).click();
  await expect(page.getByRole("dialog", { name: "Projects" })).toBeVisible();
  await page.getByPlaceholder("New project name…").fill("Demo Project");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const openBtn = page.locator("button.project-open", {
    hasText: "Demo Project",
  });
  await expect(openBtn).toBeVisible();
  await openBtn.click();
  await expect(page.locator(".project-banner-name")).toHaveText("Demo Project");
  // It also appears as a drop target in the sidebar projects panel.
  await expect(
    page.locator("button.project-nav", { hasText: "Demo Project" })
  ).toBeVisible();
});

test("creates the index and ingests project files (mocked tool API)", async ({
  page,
}) => {
  // Stub the MCP tool proxy so the test needs no running knowledge server.
  await page.route("**/api/tool", async (route) => {
    const body = route.request().postDataJSON() as { tool: string };
    const byTool: Record<string, string> = {
      create_index: 'Created index "azlens".',
      ingest_documents: 'Ingested 1 document(s) into "azlens".',
      delete_documents: "Deleted 1/1 document(s).",
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: { content: [{ text: byTool[body.tool] ?? "ok" }] },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Manage" }).click();
  await page.getByPlaceholder("New project name…").fill("RAG Project");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const item = page.locator(".project-item", { hasText: "RAG Project" });
  await item.getByRole("button", { name: /Files/ }).click();

  // Create index is always available (first-time setup).
  await item.getByRole("button", { name: "Create index" }).click();
  await expect(item.locator(".project-files-status")).toHaveText(
    /Created index/
  );

  // Upload a file, then ingest it to the knowledge base.
  const fileChooserPromise = page.waitForEvent("filechooser");
  await item.getByRole("button", { name: "Add files" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Azure AI Search grounds answers with citations."),
  });
  await expect(item.locator(".project-file-name")).toHaveText("notes.md");
  await item.getByRole("button", { name: "Ingest to knowledge base" }).click();
  await expect(item.locator(".project-files-status")).toHaveText(/Ingested/);
});

test("runs the multi-agent orchestrator (mocked API)", async ({ page }) => {
  await page.route("**/api/orchestrate", async (route) => {
    const events = [
      {
        type: "plan",
        plan: [{ agentId: "research", task: "Gather latency facts" }],
      },
      {
        type: "step-start",
        index: 0,
        agentId: "research",
        agentName: "Research",
        task: "Gather latency facts",
        at: 0,
      },
      {
        type: "step-done",
        index: 0,
        result: {
          agentId: "research",
          agentName: "Research",
          task: "Gather latency facts",
          output: "West Europe has lower EU latency.",
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          cost: 0.001,
          startedAt: 0,
          endedAt: 40,
        },
      },
      {
        type: "step-start",
        index: 1,
        agentId: "coder",
        agentName: "Code Assistant",
        task: "Write a retry helper",
        at: 0,
      },
      {
        type: "step-done",
        index: 1,
        result: {
          agentId: "coder",
          agentName: "Code Assistant",
          task: "Write a retry helper",
          output: "```ts\nexport const retry = () => {};\n```",
          usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
          cost: 0.002,
          startedAt: 0,
          endedAt: 50,
        },
      },
      {
        type: "answer",
        answer: "Use West Europe and add exponential backoff retries.",
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Orchestrator" }).click();
  await expect(
    page.getByRole("dialog", { name: "Orchestrator" })
  ).toBeVisible();
  await page
    .getByPlaceholder(/the planner splits it across/i)
    .fill("Compare regions and add retries");
  await page.getByRole("button", { name: "Run", exact: true }).click();

  await expect(page.locator(".orchestrator-answer")).toContainText(
    /West Europe/
  );
  await expect(page.locator(".orchestrator-step")).toHaveCount(2);
  await expect(page.locator(".orchestrator-agent").first()).toHaveText(
    "Research"
  );
  // Parallelism timeline with per-step tokens and a total.
  await expect(page.locator(".orchestrator-timeline")).toBeVisible();
  await expect(page.locator(".orchestrator-tl-bar")).toHaveCount(2);
  await expect(page.locator(".orchestrator-timeline")).toContainText(
    /70 tokens/
  );
});

test("captures thumbs feedback on an assistant message (mocked API)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "azlens.conversations",
      JSON.stringify([
        {
          id: "c-fb",
          title: "Feedback demo",
          updatedAt: Date.now(),
          renamed: true,
        },
      ])
    );
    localStorage.setItem("azlens.active", "c-fb");
    localStorage.setItem(
      "azlens.messages.c-fb",
      JSON.stringify([
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello there!" }],
        },
      ])
    );
  });

  let posted: { rating?: string } | null = null;
  await page.route("**/api/feedback", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/");
  await page.locator(".msg.assistant").first().hover();
  const up = page.getByRole("button", { name: "Thumbs up" });
  await up.click();
  await expect(up).toHaveClass(/rated/);
  expect(posted).not.toBeNull();
  expect(posted!.rating).toBe("up");
});

test("shows the signed-in user's initials avatar (mocked /api/me)", async ({
  page,
}) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        name: "Michael M",
        email: "mimuruth@example.com",
        picture: null,
        provider: "github",
        providers: ["github"],
      }),
    });
  });
  await page.goto("/");
  await expect(page.locator(".profile-chip .avatar-initials")).toHaveText("MM");
  await expect(page.locator(".profile-name")).toHaveText("Michael M");
  await expect(page.getByRole("link", { name: "Sign out" })).toBeVisible();
});

test("shows provider sign-in buttons when unauthenticated (mocked /api/me)", async ({
  page,
}) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: false,
        name: null,
        email: null,
        picture: null,
        provider: null,
        providers: ["aad", "github", "google"],
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Microsoft" })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    /\/\.auth\/login\/github/
  );
  await expect(page.getByRole("link", { name: "Google" })).toBeVisible();
});

test("voice: mic and speak controls appear and speak calls the API (stubbed)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Stub Web Speech APIs so the buttons render in headless chromium.
    // speechSynthesis is a read-only accessor, so define it explicitly.
    Object.defineProperty(window, "SpeechRecognition", {
      configurable: true,
      value: class {
        start() {}
        stop() {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: () => {
          (window as unknown as Record<string, unknown>).__spoke = true;
        },
        cancel: () => {},
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        constructor(public text: string) {}
      },
    });
    localStorage.setItem(
      "azlens.conversations",
      JSON.stringify([
        {
          id: "c-v",
          title: "Voice demo",
          updatedAt: Date.now(),
          renamed: true,
        },
      ])
    );
    localStorage.setItem("azlens.active", "c-v");
    localStorage.setItem(
      "azlens.messages.c-v",
      JSON.stringify([
        { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
        {
          id: "a1",
          role: "assistant",
          parts: [{ type: "text", text: "Hello there!" }],
        },
      ])
    );
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Dictate/ })).toBeVisible();
  await page.locator(".msg.assistant").first().hover();
  await page.getByRole("button", { name: /Speak/ }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__spoke
    )
  ).toBe(true);
});
