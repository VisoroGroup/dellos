# AGENTS.md — Visoro Global SRL

## Owner and Workflow

- Single operator: Robert (CEO, non-developer, zero coding experience)
- All development happens through AI-assisted prompts (vibe-coding)
- Robert describes what he wants in plain language (often Hungarian); Claude builds it
- There is no code review process, no CI/CD pipeline, no test suite unless explicitly created

## Language

- Always communicate with Robert in Hungarian. All questions, explanations, summaries, and status updates must be in Hungarian.
- Code itself (variable names, comments, commit messages) should remain in English.
- If a technical term has no clear Hungarian equivalent, use the English term but explain it simply in Hungarian.

## First Step on Any Project

Before starting any work, examine the full project structure, config files (package.json, requirements.txt, or equivalent), database schema, and existing code patterns. Do not assume any framework, language, or architecture — verify everything first by reading the codebase.

## Core Rules

1. Never delete or overwrite existing functionality without explicit confirmation
2. Before making changes, briefly state what you will change and what it will affect
3. Before starting any task, ask as many clarifying questions as needed to be 100% sure you understand what Robert wants. Do not assume intent, scope, or design decisions — always ask. It is better to ask five questions upfront than to build the wrong thing. Group your questions into a single message rather than asking one at a time.
4. Keep the codebase simple — avoid unnecessary abstractions, over-engineering, or splitting into too many files
5. When adding a new feature, integrate it into the existing structure rather than creating parallel systems
6. Always preserve existing data and database content — never drop tables or clear data without explicit approval

## Code Style

- Write clear, readable code with descriptive variable and function names
- Add brief comments only where logic is non-obvious
- Keep files self-contained where possible — minimize unnecessary imports and dependencies
- Use the same patterns and conventions already present in the codebase
- When in doubt, look at how existing features are implemented and follow that pattern

## Database

- Never run destructive migrations (DROP TABLE, DELETE FROM, TRUNCATE) without explicit approval
- When modifying schema, use additive changes (ADD COLUMN) rather than destructive ones
- Always back up or confirm before altering existing tables
- If creating new tables, follow the naming conventions already used in the project

## Deployment

- Before suggesting deployment steps, check the current deployment method from the project files
- Never push to production without confirming with Robert
- If environment variables or secrets are involved, ask rather than guess

## Error Handling

- When something breaks, explain the problem in plain language first, then fix it
- Do not silently swallow errors — surface them clearly
- If a fix requires changing multiple files, list all changes before making them

## Large Changes — Mandatory Step-by-Step Execution

Robert often requests large, multi-part changes. These MUST be broken into small, sequential steps:

1. First, present a numbered plan of all steps in Hungarian. Wait for Robert's approval before starting.
2. Execute one step at a time. After each step, verify it works and confirm that nothing else broke.
3. After each step, report to Robert: "Kesz az X. lepes. Teszteltem, mukodik. A tobbi funkcio is rendben. Kovetkezo lepes: Y. Mehetek?"
4. If anything breaks during a step, STOP. Fix it before proceeding. Do not stack changes on top of broken code.
5. Never combine multiple unrelated changes into one step — each step should do exactly one thing.

## Regression Prevention

Since existing features sometimes break after changes:

- Before starting any change, make a mental inventory of all features that COULD be affected.
- After completing the change, manually check each of those features.
- Pay special attention to: navigation/routing, form submissions, data display/listing, filtering, login/authentication if present, and any feature that shares code or database tables with the changed area.
- If you discover a regression, fix it immediately and report it to Robert: what broke, why, and how you fixed it.

## Quality and Verification

- After completing any change, test it yourself before reporting it as done. Run the app, click through the affected features, verify the output. Do not say "done" until you have confirmed it works.
- If you cannot test something directly (e.g. email sending, external API), explicitly tell Robert what you tested and what still needs manual verification.
- After every change, check that existing features still work — not just the new one. If a change could affect other parts of the app, verify those too.
- When writing new code, think through edge cases: what happens with empty inputs, missing data, duplicate entries, very long text, special characters? Handle these gracefully.
- If you encounter an error during development, fix it before moving on. Do not leave known bugs behind.
- At the end of each task, provide a short summary: what was changed, what was tested, what works, and if anything needs Robert's manual check.
- If a task is complex (multiple features or files), break it into smaller steps. Complete and verify each step before moving to the next.
- Never assume a change works just because there are no error messages — actively verify the result is correct.

## What NOT To Do

- Do not refactor working code unless explicitly asked
- Do not introduce new frameworks, ORMs, or major dependencies without discussion
- Do not create test files, linting configs, or CI pipelines unless requested
- Do not add authentication, authorization, or security layers without explicit instruction
- Do not assume Robert knows technical terminology — explain decisions simply
