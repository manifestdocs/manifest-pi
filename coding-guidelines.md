# TypeScript Coding Guidelines

## General

- Target ES2022 with NodeNext module resolution
- Strict TypeScript — no `any` unless interfacing with external untyped APIs
- Pure functions preferred; minimize side effects
- Early return with guard clauses
- Functions under 30 lines; break up longer ones
- Limit nesting to 3 levels

## Naming

- `camelCase` for variables, functions, parameters
- `PascalCase` for types, interfaces, classes
- `UPPER_SNAKE_CASE` for constants
- Descriptive names — avoid abbreviations except common ones (id, url, etc.)

## TypeBox Schemas

- Use `Type.Object({})` for tool parameters
- Use `StringEnum` from `@mariozechner/pi-ai` for string enums (NOT `Type.Union`/`Type.Literal` — breaks Google's API)
- Use `Type.Optional()` for optional fields
- Add `{ description: "..." }` to every schema field

## Tool Registration

```typescript
pi.registerTool({
  name: "manifest_tool_name",
  description: "What this tool does",
  promptSnippet: "One-line for system prompt",
  parameters: Type.Object({ /* TypeBox schema */ }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Call client, format response
    return { content: [{ type: "text", text: result }] };
  },
});
```

## Error Handling

- Custom error classes: `NotFoundError`, `ConflictError`, `ValidationError`, `ConnectionError`
- Catch fetch errors and wrap in `ConnectionError`
- Tool execute functions catch client errors and return error text (never throw)

## Testing

- Vitest with BDD-style `describe`/`it`
- Mock `global.fetch` with `vi.fn()` — no msw
- Test that correct endpoints are called with correct parameters
- Test that responses are formatted correctly
- Structure: `tests/` mirrors `src/` (e.g., `tests/client.test.ts` for `src/client.ts`)

## Imports

- Use `.js` extension in relative imports (NodeNext resolution)
- Group: external packages first, then local modules
