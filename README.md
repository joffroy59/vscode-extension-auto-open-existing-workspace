# VSCode Extension: Open Existing Workspace

Opens an existing `.code-workspace` file that contains the folder currently opened in VS Code.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE)
for the full license text.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `openWorkspaceIfExists.enabled` | `true` | Check automatically on startup. |
| `openWorkspaceIfExists.pattern` | `*.code-workspace` | File pattern of workspace files. |
| `openWorkspaceIfExists.workspacesFolder` | `${env:OneDrive}\workspace` | Folder searched recursively for matching workspace files. When it exists, it is the default location in the new-workspace folder picker. Supports `${env:NAME}` environment variables or an absolute path. |
| `openWorkspaceIfExists.createWorkspaceIfMissing` | `true` | Offer to create and open a workspace file if no matching workspace is found. |
| `openWorkspaceIfExists.confirmBeforeCreate` | `true` | Ask before creating a workspace file. |
| `openWorkspaceIfExists.workspaceFileCreationFolder` | `""` | Initial folder for the creation picker. When empty, the picker uses `workspacesFolder` if it exists, otherwise the opened folder. Relative paths resolve from the opened folder. Supports `${env:NAME}`. |

If exactly one workspace matches, you are asked to confirm opening it. If several match, you choose one from a list.
When no workspace matches, you can choose the folder where the new workspace file will be saved. Cancelling the folder picker leaves the current folder unchanged.

## Startup order and settings

Detection starts immediately when the extension activates at startup (`*`),
without waiting for `onStartupFinished` or an additional timer. The enabled
setting and workspace selection/confirmation still apply.

**VS Code does not guarantee extension activation order.** Other extensions can
activate and write settings while detection or a selection prompt is pending.
This extension cannot block them or redirect their settings writes.

To ensure the workspace is loaded before other extensions activate, use
**File > Open Workspace from File...** and select the existing `.code-workspace`,
or launch `code "C:\path\to\existing.code-workspace"` instead of opening its folder.
Workspace-scoped settings then belong in the workspace file's `settings` object.
Extensions that explicitly write folder-scoped settings or directly create
`.vscode/settings.json` can still write inside a project folder even with the
workspace open; those extensions must be configured or changed separately.
This extension does not move, delete, or rewrite settings created by others.

## Package and install

### Automated GitHub Releases

Pushing a version tag starts the `Release VSIX` workflow. It runs `npm ci` and
`npm test`, checks that the tag matches the version in `package.json`, packages
the extension, and creates a GitHub Release with the `.vsix` attached. After
that workflow succeeds, `Publish VSIX` downloads the same package and publishes
it to the VS Code Marketplace using GitHub Actions OIDC Trusted Publishing.

### Marketplace Trusted Publishing

Before the first release, open [Marketplace publisher management](https://marketplace.visualstudio.com/manage/publishers/), select the `joffroy` publisher, open **Trusted Publishing**, and create a policy with:

- **Policy name:** `Release Workflow` (or another recognizable name)
- **Provider:** `GitHub Actions`
- **Repository owner:** `joffroy59`
- **Repository:** `vscode-extension-auto-open-existing-workspace` (omit `.git`)
- **Workflow:** `publish.yml` (the file under `.github/workflows`)
- **Environment:** leave blank unless the workflow uses a GitHub environment

If the policy shows an activation deadline, run the workflow before it expires.
For the current `"version": "1.0.6"` in `package.json`, run:

```powershell
git tag v1.0.6
git push origin v1.0.6
```

Use a new tag matching the updated package version for each release.
If the Marketplace publish job fails after the GitHub Release succeeds, rerun
`Publish VSIX` from GitHub Actions and enter the successful `Release VSIX` run ID
to reuse its uploaded VSIX artifact without creating another release.
See the [VS Code Marketplace release skill](.github/skills/vscode-marketplace-release/SKILL.md)
for the workflow creation and recovery procedure.

To create a local installable package without making a release:

```powershell
npm run package:vsix
```

The command compiles the extension and creates
`vscode-extension-auto-open-existing-workspace-1.0.6.vsix`. Development sources, tests, and
dependencies are excluded from the package.

In VS Code, open **Extensions** (`Ctrl+Shift+X`), click **...**, choose
**Install from VSIX...**, and select the generated file. Reload VS Code if prompted.

## Running tests

Run `npm test` to compile the extension and execute its regression tests using
Node.js's built-in test runner (Node.js 18 or newer). The tests use real temporary
workspace files with mocked VS Code APIs to verify matching, JSONC parsing,
recursive discovery, confirmation, selection, cancellation, and startup behavior.
Temporary files are removed after each test.

A read-only smoke test also searches the configured default workspace directory
for this project's folder if that directory exists. It never opens a VS Code
window or changes files in that directory.

## Launch from the VS Code UI

1. Open this repository folder in VS Code.
2. Open **Run and Debug** (`Ctrl+Shift+D`) and select **Run Extension**.
3. Press **F5** or click the green start button.

VS Code compiles the extension first, then opens a separate **Extension
Development Host** window with this repository folder and the development
extension loaded. You can set breakpoints in `src/extension.ts` in the original
window. After changing the code, restart the debug session to compile and load
the changes. Stop debugging with `Shift+F5`.

In the development host, open a folder listed in one of your workspace files.
Run **Open Existing Workspace** from the Command Palette. Confirm the single
match prompt, or choose a workspace when multiple files match; cancelling should
leave the current folder open. Opening a `.code-workspace` directly should not
prompt again.
