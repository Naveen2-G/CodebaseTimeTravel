# Prior Art

## Product 1

Name: GitHub Copilot / Copilot Workspace

What it does:
Provides inline AI code completion, chat assistance, and workspace feature generation directly inside code editors and pull requests based on current file context.

How Codebase Time Traveler differs:
GitHub Copilot primarily looks at active files and local prompt context to answer *how* to write code. Codebase Time Traveler specifically targets *why* code exists by cross-referencing source code with historical evidence—mapping Git commits, diffs, PRs, issues, and test histories—and performing risk analysis to answer "What happens if I change or remove this code?".

## Product 2

Name: Mintlify / Swimm

What it does:
Generates static documentation and creates code walkthroughs linked to repository paths to help onboard developers.

How Codebase Time Traveler differs:
Documentation generators require manual creation or produce high-level static overview docs. Codebase Time Traveler dynamically answers targeted developer queries on arbitrary selected code blocks using deep temporal Git and PR forensic history, refusing to invent explanations when historical evidence is insufficient.

## Product 3

Name: Sourcegraph Cody

What it does:
Offers enterprise codebase search and AI chat over an entire repository index to find file references and explain code functionality.

How Codebase Time Traveler differs:
Sourcegraph Cody focuses on broad semantic search and functional code explanation ("What does this code do?"). Codebase Time Traveler focuses on historical reasoning ("Why was this code added in this specific way?") and change impact simulation ("What breaks or changes if I refactor or delete this function?").
