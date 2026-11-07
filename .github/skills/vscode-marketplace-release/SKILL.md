---
name: vscode-marketplace-release
description: "Create or maintain separate GitHub tag-release and VS Code Marketplace publishing workflows using OIDC Trusted Publishing. Use when adding release automation, publishing a VSIX, configuring Marketplace Trusted Publishing, or recovering a failed Marketplace publish."
---

# VS Code Marketplace Release Workflows

Use this skill to create two coordinated GitHub Actions workflows: one creates a GitHub Release from a version tag, and the other publishes the same VSIX to the Visual Studio Code Marketplace.

This repository's working examples are [release.yml](../../workflows/release.yml) and [publish.yml](../../workflows/publish.yml). Reuse their artifact name, workflow display name, and run-ID handoff when maintaining this project.

## Procedure

1. Inspect the repository before editing. Read `package.json`, `package-lock.json`, the README release section, and existing workflows. Check the current branch and worktree. Preserve existing edits, publisher IDs, package names, workflow names, version conventions, and release assets.
2. Keep the two responsibilities separate. Use `.github/workflows/release.yml` for tag validation, tests, packaging, and GitHub Release creation. Use `.github/workflows/publish.yml` for Marketplace publishing. Avoid a `release` event as the only handoff when the GitHub Release is created using `GITHUB_TOKEN`, since GitHub suppresses many events caused by that token.
3. Configure `release.yml` to run for `v*` tags. Grant `contents: write`. Check out the tag, install with `npm ci`, run the project tests, and fail unless the tag exactly matches `v${package.json.version}`. Package once with `@vscode/vsce`, then upload the VSIX as an Actions artifact (for example, `extension-vsix`) and attach that same file to the GitHub Release. Give the artifact enough retention for a manual retry.
4. Configure `publish.yml` to run on `workflow_run` completion of the exact release workflow display name and skip unless its conclusion is `success`. Grant `actions: read` and `id-token: write`; keep other permissions minimal. Download the artifact from `github.event.workflow_run.id`, then publish that exact VSIX with `vsce publish --oidc --packagePath <file>`. Use a Node version supported by the selected vsce version; `@vscode/vsce@4.1.0` requires Node 22 or newer.
5. Add a `workflow_dispatch` retry path if Marketplace publishing must be recoverable without pushing the tag again. Require the successful release workflow run ID, download its artifact using `actions/download-artifact` with `github-token` and `run-id`, and publish the existing VSIX. Do not recreate the GitHub Release or move/reuse a published tag to retry Marketplace publishing.
6. Document the one-time Trusted Publishing setup in the README or a dedicated release document. Include the exact Marketplace publisher policy fields below, replacing owner, repository, and workflow values with the target repository's values.
7. Validate YAML/frontmatter, confirm `npm test` and local packaging work, and verify tag/version agreement before creating a release tag. Only tag a commit containing both workflows on the default branch and after the Marketplace policy has been configured.
8. After successful publication, verify the GitHub Release and VSIX asset, the successful Marketplace publish log/version, and the public Marketplace listing. The listing may lag the publish log; report that distinction instead of claiming the visible listing updated when it still shows an older version.
9. Follow the repository's post-release rule: make a separate commit to bump the patch version for development and update both `package.json` and `package-lock.json`. Do not amend or move the release tag.

## Trusted Publishing Policy

In [Marketplace publisher management](https://marketplace.visualstudio.com/manage/publishers/), select the existing publisher, open **Trusted Publishing**, and create a policy:

- **Policy name:** a recognizable name such as `Release Workflow`
- **Provider:** `GitHub Actions`
- **Repository owner:** the GitHub owner/organization, without a URL
- **Repository:** the repository slug, without `.git`
- **Workflow:** the workflow filename under `.github/workflows`, such as `publish.yml` (not the workflow display name)
- **Environment:** leave blank unless the GitHub Actions job uses a named environment; if used, the name must match exactly

If the Marketplace policy shows an activation deadline, run the configured workflow before it expires.

## Recovery and Verification

- If `release.yml` fails, inspect tests, tag validation, packaging, and GitHub Release creation before retrying the tag workflow.
- If `release.yml` succeeds but `publish.yml` fails, use the manual `Publish VSIX` workflow with that successful release run ID. The release artifact must still be within its retention period.
- The Marketplace publish log should identify the publisher, extension ID, and version. Check the Marketplace page separately because its public metadata may take time to refresh.
- Never expose a PAT or other credential in workflow logs. Prefer OIDC Trusted Publishing; do not commit secrets.