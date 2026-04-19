# basecamp-mcp

MCP server that wraps the [Basecamp CLI](https://github.com/basecamp/basecamp-cli)
as structured tools for Claude and other AI agents.

## Why

This server exposes the authenticated `basecamp` CLI as MCP tools, giving agents full
access to your Basecamp projects, todos, documents, and messages, if cli tools are not supported natively (e.g., Claude.ai). Two integration modes are supported:

| Mode               | Transport              | Use case                                                      |
| ------------------ | ---------------------- | ------------------------------------------------------------- |
| **Claude Desktop** | stdio (`.mcpb` bundle) | Claude spawns the server — no separate Node.js install needed |
| **Claude.ai web**  | Streamable HTTP        | Long-running local server, Claude connects over HTTP          |

With the second mode Streamable HTTP for other, MCP compatible agents as well.

## Prerequisites

Both modes require:

- [Basecamp CLI](https://github.com/basecamp/basecamp-cli) installed and authenticated
  (`basecamp auth login`)

Claude.ai web mode additionally requires:

- Node.js ≥ 22
- HTTPS tunnel (e.g. ngrok) if this MCP server runs locally (be aware of the security implications of exposing it publicly!)

## Claude Desktop Integration (`.mcpb`)

Claude Desktop includes its own Node.js runtime and runs extensions isolated by default.

```bash
# Install the mcpb CLI (once)
npm install -g @anthropic-ai/mcpb

# Build and pack
npm run build
npm run pack
```

This produces `basecamp-mcp-0.1.0.mcpb`. Open it — Claude Desktop will prompt you to
install and ask for your **Basecamp Account ID** (run `basecamp accounts list --json`
in Terminal to find it).

**Binary auto-detection**: at startup the server locates the `basecamp` binary by
checking common install locations (`~/.local/bin`, Homebrew ARM/Intel, `/usr/bin`),
then falls back to spawning a login shell (`which basecamp`). If auto-detection fails,
enter the full path in the **Basecamp CLI path** field during installation or through the extension configuration screen.

## Claude.ai (Web) Integration

```bash
git clone <repo>
cd basecamp-mcp
npm install
cp .env.example .env   # then edit .env with your values
npm run build
npm start
```

The server starts on `http://localhost:3333/mcp` by default.

### HTTPS / Remote Access

To get a public HTTPS URL, use a tunnel:

| Tool                  | Command                                          | Notes                                |
| --------------------- | ------------------------------------------------ | ------------------------------------ |
| **ngrok**             | `ngrok http 3333`                                | Free tier; URL changes on restart    |
| **Cloudflare Tunnel** | `cloudflared tunnel --url http://localhost:3333` | Free; stable URL with a named tunnel |
| **localhost.run**     | `ssh -R 80:localhost:3333 nokey@localhost.run`   | No install needed                    |

Use the resulting `https://….ngrok-free.app/mcp` (or equivalent) as the integration URL. However, be aware of the security implications of exposing your Basecamp data to the public internet.

## Environment Variables

| Variable              | Required | Default         | Description                                     |
| --------------------- | -------- | --------------- | ----------------------------------------------- |
| `BASECAMP_ACCOUNT_ID` | No\*     | auto-discovered | Basecamp account ID                             |
| `BASECAMP_READONLY`   | No       | `false`         | Set `true` to disable all write tools           |
| `BASECAMP_PATH`       | No       | auto-detected   | Absolute path to the `basecamp` binary          |
| `PORT`                | No       | `3333`          | HTTP port the server listens on (web mode only) |

\*Auto-discovered via `basecamp accounts list` on first use. Set explicitly to skip the
extra subprocess.

Copy `.env.example` to `.env` and fill in your values.

## Available Tools

| Tool              | Type  | Description                                         |
| ----------------- | ----- | --------------------------------------------------- |
| `list_projects`   | read  | List all projects                                   |
| `list_todos`      | read  | List todos in a project (filter by status/assignee) |
| `find_documents`  | read  | List documents in Docs & Files                      |
| `read_document`   | read  | Fetch full content of a document                    |
| `search`          | read  | Full-text search (project-scoped or cross-project)  |
| `create_document` | write | Create a document in Docs & Files                   |
| `update_document` | write | Update title/content of a document                  |
| `create_todo`     | write | Create a todo in a todolist                         |
| `complete_todo`   | write | Mark todos as complete                              |
| `post_message`    | write | Post a message to the message board                 |

Write tools are not registered when `BASECAMP_READONLY=true`.

## Smoke Test (Web Mode)

```bash
# Start the server first: npm start

# List registered tools
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call list_projects
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```
