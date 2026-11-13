# Create the GitHub repo and turn on Pages

Status: ready-for-human
Type: task

NEW-GAME.md step 4 (agents can't create public repos). In `Projects\foldlab\`:

    gh repo create trevordobrinska/foldlab --public --source . --push

then repo Settings > Pages > Source = "GitHub Actions". Check `https://trevordobrinska.github.io/foldlab/` shows the starter screen with the house button. Sources are gitignored (ADR 0002), so nothing private is pushed.
