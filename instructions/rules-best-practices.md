---
description: Best practices and formatting guidelines for writing effective instructions
inline: false
---

## Instruction Structure

```
---
description: Clear, one-line description
inline: boolean
---

## Main Points as headers
  - Sub-points with specifics
```

## Frontmatter Guidelines

- **`inline: true`** inlines the full content into AGENTS.md
- **`inline: false`** (default) uses progressive disclosure - only description is inlined with a link to the full content

## Code Examples

```typescript
// DO: Good pattern
const correct = true;

// DON'T: Anti-pattern
const incorrect = false;
```

## Guidelines

- Start with overview, then specifics
- Write concisely - include only what's necessary
- Use bullet points
- Include both DO/DON'T examples
- Reference existing code
- Do not repeat yourself by cross-referencing other instruction files
