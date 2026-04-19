# Manual Test Requests

Smoke tests for the HTTP transport. Start the server first (`npm start`) and
replace `46839116` with a project ID you have write access to.

All requests require both headers:

- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`

---

## 1. List tools

```bash
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expect: JSON-RPC response listing all registered tools. Write tools are omitted
when `BASECAMP_READONLY=true`.

---

## 2. List projects

```bash
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}'
```

Expect: array of projects with `id`, `name`, `purpose`, …

---

## 3. Create document with rich Markdown

Exercises the Markdown → HTML conversion (tables, headings, lists, code).

```bash
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"create_document",
      "arguments":{
        "project":"46839116",
        "title":"Markdown Test",
        "body":"# Heading\n\n**Bold** and *italic* text.\n\n## Table\n\n| Col A | Col B |\n|-------|-------|\n| 1     | 2     |\n| 3     | 4     |\n\n## List\n\n- item one\n- item two\n\n## Code\n\n```js\nconsole.log(\"hi\");\n```"
      }
    }
  }'
```

Expect: document created with the table, headings, list, and code block
rendered natively in Basecamp. Copy the returned `id` for the next two tests.

---

## 4. Update document — title only (body must be preserved)

Exercises the fetch-merge fix — the omitted `body` field must not wipe.

```bash
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":4,
    "method":"tools/call",
    "params":{
      "name":"update_document",
      "arguments":{
        "id":"REPLACE_WITH_DOC_ID",
        "project":"46839116",
        "title":"Markdown Test (renamed)"
      }
    }
  }'
```

Expect: title updated in Basecamp, body unchanged (table still renders).

---

## 5. Update document — body only (title must be preserved)

```bash
curl -s -X POST http://localhost:3333/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "id":5,
    "method":"tools/call",
    "params":{
      "name":"update_document",
      "arguments":{
        "id":"REPLACE_WITH_DOC_ID",
        "project":"46839116",
        "body":"Updated content with a [link](https://basecamp.com) and a new table:\n\n| X | Y |\n|---|---|\n| a | b |"
      }
    }
  }'
```

Expect: title still `Markdown Test (renamed)`, body replaced with the new
content (link active, table rendered).
