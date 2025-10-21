# Code Review Before Commit

Review all current changes (typically all files are staged). Detect logical, structural, or quality issues, categorize them by severity, and ensure the code is ready to be committed.

## 1. Scope and Context

- Review the full diff between the current working directory and the last commit.
- If any files are modified but not staged, include them in the review and warn about them.
- Understand the intent of the change.

## 2. Critical Issues (must fix before commit)

Flag anything that could cause runtime or logical errors:

- Incorrect conditions, bad assumptions or unhandled cases.
- Public API changes or contract violations not reflected in docs.
- Inefficiencies or unnecessary complexity.
- Ensure no leftover debug logs.

## 3. Non-blocking Issues (nitpicks & improvements)

Provide suggestions for clarity, maintainability, and polish:

- Style / consistency - naming, formatting, comment clarity.
- Code structure - overly long functions, duplication, unclear separation of concerns.
- Docs / Comments - missing or outdated documentation, unclear logic.
- Tests - encourage new or updated tests for new logic.

## 4. Categorize & Summarize

Output structured feedback like this:

```
Critical:
- [ ] (file:line) Description
- [ ] (file:line) Description

Suggestions:
- [ ] (file:line) Description
```

Each item should be specific, actionable, and concise.

## 6. Commit Message Suggestion

1. Summarize the intent of the changes and affected areas.
2. Generate a concise, conventional commit message following this pattern:

```
<type>(<scope>): <short summary>

<optional longer description>
```

Examples of `<type>`: feat, fix, refactor, docs, test, chore.

Example:

```
feat(api): add support for async requests in data service
```

## 7. Commit Suggestion

After outputting the suggested commit message:

- Ask the user to confirm or edit it.
- Once confirmed, suggest running the equivalent of:
  ```
  git commit -m "<final commit message>"
  ```
- If the working tree is clean, suggest proceeding with the commit.
