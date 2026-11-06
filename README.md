# VSCode Extension: Open Workspace If Exists

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

Pushing a version tag creates a GitHub Release with an installable `.vsix`
attached. The workflow runs `npm ci` and `npm test`, checks that the tag matches
the version in `package.json`, and then packages and releases the extension.
For the current `"version": "1.0.3"` in `package.json`, run:

```powershell
git tag v1.0.3
git push origin v1.0.3
```

Use a new tag matching the updated package version for each release. The
workflow creates GitHub Releases only; it does not publish to the VS Code
Marketplace.

To create a local installable package without making a release:

```powershell
npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository --allow-star-activation
```

The command compiles the extension and creates
`vscode-extension-open-workspace-1.0.3.vsix`. Development sources, tests, and
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
Run **Open Workspace If Exists** from the Command Palette. Confirm the single
match prompt, or choose a workspace when multiple files match; cancelling should
leave the current folder open. Opening a `.code-workspace` directly should not
prompt again.
