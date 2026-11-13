# Create the GitHub repo and turn on Pages

Status: resolved
Type: task

NEW-GAME.md step 4 (agents can't create public repos). In `Projects\foldlab\`:

    gh repo create trevordobrinska/foldlab --public --source . --push

then repo Settings > Pages > Source = "GitHub Actions". Check `https://trevordobrinska.github.io/foldlab/` shows the starter screen with the house button. Sources are gitignored (ADR 0002), so nothing private is pushed.

## Answer

Dad created the repo; Pages was then enabled via the API (build type: workflow) and the deploy re-run. Live at https://trevordobrinska.github.io/foldlab/ (HTTP 200, house button present). Default branch is `master`; the deploy workflow accepts it.
