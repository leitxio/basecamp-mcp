import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createServer as createHttpServer, IncomingMessage } from "http";
import { execBasecamp, flag, initBasecampPath } from "./cli.js";

config();
await initBasecampPath();

const READONLY = process.env["BASECAMP_READONLY"] === "true";

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createMcpServer() {
  const server = new McpServer({ name: "basecamp-mcp", version: "0.1.0" });

  // ── 1. list_projects ────────────────────────────────────────────────────────

  server.tool(
    "list_projects",
    "List all Basecamp projects in the account.",
    {},
    async () => ok((await execBasecamp(["projects", "list"])).data),
  );

  // ── 2. list_todos ───────────────────────────────────────────────────────────

  server.tool(
    "list_todos",
    "List todos in a Basecamp project. Optionally filter by status (completed/incomplete) and/or assignee.",
    {
      project: z.string().describe("Project ID or name"),
      status: z
        .enum(["completed", "incomplete"])
        .optional()
        .describe("Filter by completion status"),
      assignee: z
        .string()
        .optional()
        .describe("Filter by assignee name, email, or 'me'"),
    },
    async ({ project, status, assignee }) => {
      const f = [...flag("--in", project)];
      if (status) f.push(...flag("--status", status));
      if (assignee) f.push(...flag("--assignee", assignee));
      return ok((await execBasecamp(["todos", "list"], f)).data);
    },
  );

  // ── 3. find_documents ───────────────────────────────────────────────────────

  server.tool(
    "find_documents",
    "List documents in a project's Docs & Files section. Optionally filter to a specific folder.",
    {
      project: z.string().describe("Project ID or name"),
      folder: z
        .string()
        .optional()
        .describe("Folder (vault) ID to list within"),
    },
    async ({ project, folder }) => {
      const f = [...flag("--in", project)];
      if (folder) f.push(...flag("--folder", folder));
      return ok((await execBasecamp(["files", "documents", "list"], f)).data);
    },
  );

  // ── 4. read_document ────────────────────────────────────────────────────────

  server.tool(
    "read_document",
    "Fetch the full content of a document by its ID.",
    {
      id: z.string().describe("Document ID"),
      project: z
        .string()
        .describe("Project ID or name that contains the document"),
    },
    async ({ id, project }) =>
      ok(
        (await execBasecamp(["files", "show", id], flag("--in", project))).data,
      ),
  );

  // ── 5. search ───────────────────────────────────────────────────────────────

  server.tool(
    "search",
    "Full-text search across Basecamp content. Omit project to search cross-project.",
    {
      query: z.string().describe("Search query string"),
      project: z
        .string()
        .optional()
        .describe("Project ID or name (omit for global search)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum number of results"),
    },
    async ({ query, project, limit }) => {
      const f: string[] = [];
      if (project) f.push(...flag("--in", project));
      if (limit !== undefined) f.push("--limit", String(limit));
      return ok((await execBasecamp(["search", query], f)).data);
    },
  );

  if (!READONLY) {
    // ── 6. create_document ────────────────────────────────────────────────────

    server.tool(
      "create_document",
      "Create a new document in a project's Docs & Files. Markdown supported in body.",
      {
        project: z.string().describe("Project ID or name"),
        title: z.string().describe("Document title"),
        body: z.string().describe("Document body (Markdown supported)"),
      },
      async ({ project, title, body }) =>
        ok(
          (
            await execBasecamp(
              ["files", "doc", "create", title, body],
              flag("--in", project),
            )
          ).data,
        ),
    );

    // ── 7. update_document ────────────────────────────────────────────────────

    server.tool(
      "update_document",
      "Update the title and/or content of an existing document.",
      {
        id: z.string().describe("Document ID"),
        project: z.string().describe("Project ID or name"),
        title: z
          .string()
          .optional()
          .describe("New title (omit to leave unchanged)"),
        body: z
          .string()
          .optional()
          .describe("New body content (omit to leave unchanged)"),
      },
      async ({ id, project, title, body }) => {
        const f = [...flag("--in", project)];
        if (title) f.push(...flag("--title", title));
        if (body) f.push(...flag("--content", body));
        return ok((await execBasecamp(["files", "update", id], f)).data);
      },
    );

    // ── 8. create_todo ────────────────────────────────────────────────────────

    server.tool(
      "create_todo",
      "Create a todo in a todolist within a project.",
      {
        project: z.string().describe("Project ID or name"),
        list_id: z.string().describe("Todolist ID"),
        title: z.string().describe("Todo content / title"),
      },
      async ({ project, list_id, title }) =>
        ok(
          (
            await execBasecamp(
              ["todo", title],
              [...flag("--in", project), ...flag("--list", list_id)],
            )
          ).data,
        ),
    );

    // ── 9. complete_todo ──────────────────────────────────────────────────────

    server.tool(
      "complete_todo",
      "Mark one or more todos as complete.",
      {
        ids: z
          .array(z.string())
          .min(1)
          .describe("Array of todo IDs to mark complete"),
      },
      async ({ ids }) => ok((await execBasecamp(["done", ...ids])).data),
    );

    // ── 10. post_message ──────────────────────────────────────────────────────

    server.tool(
      "post_message",
      "Post a message to a project's message board. Markdown and @mentions supported in body.",
      {
        project: z.string().describe("Project ID or name"),
        subject: z.string().describe("Message subject / title"),
        body: z
          .string()
          .describe("Message body (Markdown and @mentions supported)"),
      },
      async ({ project, subject, body }) =>
        ok(
          (
            await execBasecamp(
              ["message", subject, body],
              flag("--in", project),
            )
          ).data,
        ),
    );
  }

  return server;
}

// ── Transport ─────────────────────────────────────────────────────────────────

if (process.argv.includes("--stdio")) {
  // Claude Desktop (.mcpb): spawned as child process, communicates over stdio
  const transport = new StdioServerTransport();
  await createMcpServer().connect(transport);
} else {
  // Claude.ai web: long-running HTTP server
  const PORT = parseInt(process.env["PORT"] ?? "3333", 10);

  const httpServer = createHttpServer(async (req, res) => {
    if (req.url === "/mcp" || req.url?.startsWith("/mcp?")) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const server = createMcpServer();
      await server.connect(transport);
      const body = await readBody(req);
      await transport.handleRequest(req, res, body);
    } else {
      res.writeHead(404).end("Not Found");
    }
  });

  httpServer.on("error", (err) =>
    console.error("[basecamp-mcp] HTTP server error:", err),
  );
  httpServer.listen(PORT, () => {
    console.info(
      `[basecamp-mcp] Transport: HTTP — listening on http://localhost:${PORT}/mcp`,
    );
  });
}
