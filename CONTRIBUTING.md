# Contributing

Open an issue or submit a pull request from a fork. Include tests and update docs when rules or the API change. Run `npm ci && npm run check` and commit generated `dist` changes.

Only @kinteus, the personal repository owner and sole administrator, may finally merge pull requests into main. Do not grant others administrator access or add bypass actors. CODEOWNERS records ownership but does not itself enforce who can merge.

Two active rulesets protect main: one restricts updates with a repository-admin bypass available only through pull requests; the other requires a pull request and the `verify` CI check and forbids deletion/force pushes, with no bypass. Auto-merge is disabled and workflows receive read-only permissions. The owner does not need to approve their own PR (GitHub does not support that); they make the final merge decision manually.

For a release, update the package version, source, tests, docs and generated dist in a PR. After @kinteus merges it, update the application's archive dependency to that full main commit SHA and commit its lockfile. Never point production at a moving branch. No workflow publishes or merges automatically.
