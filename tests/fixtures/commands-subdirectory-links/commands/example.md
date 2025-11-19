# Example Command

This command references assets in various formats:

## Markdown Links

- [First asset in subdirectory](../rules/category-a/asset-one.mjs)
- [Second asset in subdirectory](../rules/category-a/asset-two.mjs)
- [Deeply nested asset](../rules/deep/nested/structure/config.json)

## Inline Code References

Run the script: `node ../rules/category-a/asset-one.mjs`

Execute: `../rules/category-a/asset-two.mjs`

## Bare Path References

You can also run: ../rules/deep/nested/structure/config.json

## Code Block (should NOT be rewritten)

```bash
# This is an example and should not be rewritten
node ../rules/example/fake.js
```

## Non-existent Path (should NOT be rewritten)

This path doesn't exist: ../rules/nonexistent/file.js
