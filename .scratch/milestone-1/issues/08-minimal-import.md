# Minimal Import: a cup diagram becomes a Model

Status: ready-for-agent
Type: task
Blocked by: 03, 07

A Node script on Dad's computer: takes a Source from `import/inbox/` (gitignored), asks the Claude API (latest Opus) for Fold calls per Step with Step text in FoldLab's own words, replays every Step in the engine, and writes the Model file to the published Library only if every Step replays. Otherwise it records a Failed import with the reason. A per-run cost cap (default $5) stops the run. API key from an environment variable, never committed.
