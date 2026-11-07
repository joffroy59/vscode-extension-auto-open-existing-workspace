const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const manifest = require('../package.json');

function harness(t, options = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'open-workspace-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const root = options.root || path.join(directory, 'project');
    const search = options.search || path.join(directory, 'workspaces');
    fs.mkdirSync(root, { recursive: true });
    if (!options.search) {
        fs.mkdirSync(search);
    }
    const calls = { opened: [], confirmations: [], picks: [], folderDialogs: [], errors: [], notifications: [], timers: [] };
    const local = [];
    let command;
    const uri = file => ({ fsPath: file });
    const vscode = {
        Uri: { file: uri },
        RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
        workspace: {
            workspaceFolders: options.empty ? [] : [{ uri: uri(root) }],
            workspaceFile: options.alreadyOpen ? uri(path.join(directory, 'existing.code-workspace')) : undefined,
            getConfiguration: () => ({
                get: (key, fallback) => ({
                    enabled: options.enabled ?? false,
                    confirmBeforeOpen: options.confirmBeforeOpen ?? true,
                    createWorkspaceIfMissing: options.createWorkspaceIfMissing ?? true,
                    confirmBeforeCreate: options.confirmBeforeCreate ?? true,
                    pattern: '*.code-workspace',
                    workspacesFolder: options.configuredSearch ?? search,
                    workspaceFileCreationFolder: options.workspaceFileCreationFolder ?? ''
                }[key] ?? fallback)
            }),
            findFiles: async () => local.map(uri)
        },
        commands: {
            registerCommand: (id, callback) => { command = callback; return { dispose() {} }; },
            executeCommand: async (...args) => {
                if (options.openError) {
                    throw new Error('Unable to open workspace');
                }
                calls.opened.push(args);
            }
        },
        window: {
            showErrorMessage: async message => { calls.notifications.push(message); },
            showOpenDialog: async dialogOptions => {
                calls.folderDialogs.push(dialogOptions);
                return options.cancelFolderSelection ? undefined : [uri(options.selectedCreationFolder ?? dialogOptions.defaultUri.fsPath)];
            },
            showInformationMessage: async (...args) => {
                calls.confirmations.push(args);
                if (args.includes('Create Workspace')) {
                    return options.rejectCreation ? 'Ignore' : 'Create Workspace';
                }
                return options.ignore ? 'Ignore' : 'Open Workspace';
            },
            showQuickPick: async (items, settings) => {
                calls.picks.push({ items, settings });
                return options.cancel ? undefined : items[options.pick ?? 0];
            }
        }
    };
    const exports = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'out', 'extension.js'), 'utf8'), {
        exports,
        process: { env: options.env ?? process.env },
        require: name => name === 'vscode' ? vscode : require(name),
        console: { log() {}, error: (...args) => calls.errors.push(args) },
        setTimeout: callback => { calls.timers.push(callback); }
    });
    const activation = exports.activate({ subscriptions: [] });
    function workspace(name, folders = [{ path: root }], text) {
        const file = path.join(search, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text ?? JSON.stringify({ folders }));
        return file;
    }
    return { root, search, calls, local, options, activation, command: () => command(), workspace };
}

test('default search folder uses OneDrive environment variable', () => {
    assert.equal(manifest.contributes.configuration.properties['autoOpenExistingWorkspace.workspacesFolder'].default,
        '${env:OneDrive}\\workspace');
});

test('confirmation popup setting is enabled by default', () => {
    const setting = manifest.contributes.configuration.properties['autoOpenExistingWorkspace.confirmBeforeOpen'];
    assert.equal(setting.type, 'boolean');
    assert.equal(setting.default, true);
});

test('workspace creation settings default to enabled and confirmed in the current folder', () => {
    const properties = manifest.contributes.configuration.properties;
    assert.equal(properties['autoOpenExistingWorkspace.createWorkspaceIfMissing'].default, true);
    assert.equal(properties['autoOpenExistingWorkspace.confirmBeforeCreate'].default, true);
    assert.equal(properties['autoOpenExistingWorkspace.workspaceFileCreationFolder'].default, '');
});

test('extension activates at startup rather than after startup finishes', () => {
    assert.ok(manifest.activationEvents.includes('*'));
    assert.ok(!manifest.activationEvents.includes('onStartupFinished'));
});

test('environment variables in the search folder are resolved', async t => {
    const h = harness(t);
    const file = h.workspace('one.code-workspace');
    const h2 = harness(t, {
        root: h.root, search: h.search, configuredSearch: '${env:WORKSPACE_TEST}',
        env: { WORKSPACE_TEST: h.search }
    });
    await h2.command();
    assert.equal(h2.calls.opened[0]?.[1].fsPath, file);
});

test('missing environment variables report an error', async t => {
    const h = harness(t, { configuredSearch: '${env:MISSING}', env: {} });
    await h.command();
    assert.match(h.calls.notifications[0], /Environment variable "MISSING"/);
});
test('single matching absolute folder confirms and opens in the same window', async t => {
    const h = harness(t);
    const file = h.workspace('one.code-workspace');
    h.workspace('unrelated.code-workspace', [{ path: path.join(h.root, 'other') }]);
    await h.command();
    assert.equal(h.calls.confirmations.length, 1);
    assert.equal(h.calls.picks.length, 0);
    assert.equal(h.calls.opened[0][0], 'vscode.openFolder');
    assert.equal(h.calls.opened[0][1].fsPath, file);
    assert.equal(h.calls.opened[0][2].forceNewWindow, false);
});

test('single matching workspace opens directly when confirmation is disabled', async t => {
    const h = harness(t, { confirmBeforeOpen: false });
    const file = h.workspace('one.code-workspace');
    await h.command();
    assert.equal(h.calls.confirmations.length, 0);
    assert.equal(h.calls.opened[0][1].fsPath, file);
});

test('relative paths, comments and trailing commas are supported', async t => {
    const h = harness(t);
    const relative = path.relative(h.search, h.root);
    const file = h.workspace('relative.code-workspace', [], `{
        // A workspace with JSONC
        "folders": [/* folder */ {"path": ${JSON.stringify(relative)},},],
    }`);
    await h.command();
    assert.equal(h.calls.opened[0]?.[1].fsPath, file);
});

test('multiple matching workspaces prompt and open the chosen file', async t => {
    const h = harness(t, { pick: 1 });
    h.workspace('first.code-workspace');
    h.workspace('second.code-workspace');
    await h.command();
    assert.equal(h.calls.confirmations.length, 0);
    assert.equal(h.calls.picks[0].items.length, 2);
    assert.equal(h.calls.opened[0][1].fsPath, h.calls.picks[0].items[1].uri.fsPath);
    assert.ok(h.calls.picks[0].items.every(item => item.description === item.uri.fsPath));
});

test('cancelling a multiple match selection opens nothing', async t => {
    const h = harness(t, { cancel: true });
    h.workspace('first.code-workspace');
    h.workspace('second.code-workspace');
    await h.command();
    assert.equal(h.calls.picks.length, 1);
    assert.equal(h.calls.opened.length, 0);
});

test('ignoring a single match opens nothing', async t => {
    const h = harness(t, { ignore: true });
    h.workspace('one.code-workspace');
    await h.command();
    assert.equal(h.calls.confirmations.length, 1);
    assert.equal(h.calls.opened.length, 0);
});

test('no matching workspace prompts to create and opens a folder picker at the configured workspace folder', async t => {
    const h = harness(t);
    await h.command();
    assert.equal(h.calls.confirmations.length, 1);
    assert.equal(h.calls.confirmations[0][1], 'Create Workspace');
    assert.equal(h.calls.folderDialogs.length, 1);
    assert.equal(h.calls.folderDialogs[0].defaultUri.fsPath, h.search);
    assert.equal(h.calls.folderDialogs[0].canSelectFolders, true);
    assert.equal(h.calls.folderDialogs[0].canSelectFiles, false);
    const file = path.join(h.search, 'project.code-workspace');
    assert.equal(h.calls.opened[0][1].fsPath, file);
    assert.equal(path.resolve(path.dirname(file), JSON.parse(fs.readFileSync(file, 'utf8')).folders[0].path), h.root);
});

test('workspace is created without a question when confirmation is disabled', async t => {
    const h = harness(t, { confirmBeforeCreate: false });
    await h.command();
    assert.equal(h.calls.confirmations.length, 0);
    assert.equal(h.calls.opened[0][1].fsPath, path.join(h.search, 'project.code-workspace'));
});

test('workspace is saved in the folder selected in the picker', async t => {
    const h = harness(t);
    const selectedFolder = path.join(h.search, 'picked');
    h.options.selectedCreationFolder = selectedFolder;
    await h.command();
    assert.equal(h.calls.opened[0][1].fsPath, path.join(selectedFolder, 'project.code-workspace'));
});

test('cancelling the folder picker does not create or open a workspace', async t => {
    const h = harness(t, { cancelFolderSelection: true });
    await h.command();
    assert.equal(h.calls.folderDialogs.length, 1);
    assert.equal(h.calls.opened.length, 0);
    assert.equal(fs.existsSync(path.join(h.search, 'project.code-workspace')), false);
});

test('ignoring the creation prompt leaves the folder unchanged', async t => {
    const h = harness(t, { rejectCreation: true });
    await h.command();
    assert.equal(h.calls.confirmations.length, 1);
    assert.equal(h.calls.opened.length, 0);
    assert.equal(fs.existsSync(path.join(h.root, 'project.code-workspace')), false);
});

test('workspace can be created in a configured relative folder', async t => {
    const h = harness(t, { workspaceFileCreationFolder: path.join('..', 'saved-workspaces') });
    await h.command();
    const file = path.join(path.dirname(h.root), 'saved-workspaces', 'project.code-workspace');
    assert.equal(h.calls.folderDialogs[0].defaultUri.fsPath, path.resolve(path.dirname(h.root), 'saved-workspaces'));
    assert.equal(h.calls.opened[0][1].fsPath, file);
    assert.equal(path.resolve(path.dirname(file), JSON.parse(fs.readFileSync(file, 'utf8')).folders[0].path), h.root);
});

test('workspace creation avoids overwriting a same-named file', async t => {
    const h = harness(t);
    const existing = path.join(h.search, 'project.code-workspace');
    fs.writeFileSync(existing, '{"folders":[{"path":"elsewhere"}]}');
    await h.command();
    assert.equal(fs.readFileSync(existing, 'utf8'), '{"folders":[{"path":"elsewhere"}]}');
    assert.equal(h.calls.opened[0][1].fsPath, path.join(h.search, 'project (2).code-workspace'));
});

test('workspace creation can be disabled', async t => {
    const h = harness(t, { createWorkspaceIfMissing: false });
    h.workspace('unrelated.code-workspace', [{ path: path.join(h.root, 'other') }]);
    await h.command();
    assert.equal(h.calls.opened.length + h.calls.confirmations.length + h.calls.picks.length, 0);
    assert.equal(fs.existsSync(path.join(h.root, 'project.code-workspace')), false);
});

test('local workspace fallback remains supported and duplicates are removed', async t => {
    const h = harness(t);
    const file = h.workspace('one.code-workspace');
    h.local.push(file);
    await h.command();
    assert.equal(h.calls.confirmations.length, 1);
    assert.equal(h.calls.picks.length, 0);
});

test('empty windows and already opened workspaces are not reopened', async t => {
    for (const options of [{ empty: true }, { alreadyOpen: true }]) {
        const h = harness(t, options);
        h.workspace('one.code-workspace');
        await h.command();
        assert.equal(h.calls.opened.length + h.calls.confirmations.length + h.calls.picks.length, 0);
    }
});

test('automatic startup respects enabled setting', async t => {
    const disabled = harness(t);
    await disabled.activation;
    assert.equal(disabled.calls.timers.length, 0);
    assert.equal(disabled.calls.confirmations.length, 0);
    const enabled = harness(t, { enabled: true });
    enabled.workspace('one.code-workspace');
    assert.equal(enabled.calls.timers.length, 0);
    await enabled.activation;
    assert.equal(enabled.calls.opened.length, 1);
});

test('JSONC trailing comma handling does not alter quoted folder paths', async t => {
    const h = harness(t);
    const folder = path.join(h.root, 'comma,}');
    fs.mkdirSync(folder);
    const second = harness(t, { root: folder });
    const secondFile = second.workspace('quoted.code-workspace');
    await second.command();
    assert.equal(second.calls.opened[0]?.[1].fsPath, secondFile);
});

test('UTF-8 BOM workspace files are supported', async t => {
    const h = harness(t);
    const file = h.workspace('bom.code-workspace', [], '\uFEFF' + JSON.stringify({ folders: [{ path: h.root }] }));
    await h.command();
    assert.equal(h.calls.opened[0]?.[1].fsPath, file);
});

test('opening failures are logged and shown to the user', async t => {
    const h = harness(t, { openError: true });
    h.workspace('one.code-workspace');
    await h.command();
    assert.equal(h.calls.errors.length, 1);
    assert.match(h.calls.notifications[0], /Unable to open workspace/);
    assert.equal(h.calls.opened.length, 0);
});

test('recursive search finds workspaces deeper than six directories', async t => {
    const h = harness(t);
    const file = h.workspace(path.join('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'deep.code-workspace'));
    await h.command();
    assert.equal(h.calls.opened[0]?.[1].fsPath, file);
});

test('malformed candidates do not prevent finding another valid workspace', async t => {
    const h = harness(t);
    h.workspace('broken.code-workspace', [], '{broken');
    h.workspace('invalid-folders.code-workspace', [null]);
    const file = h.workspace('valid.code-workspace');
    await h.command();
    assert.equal(h.calls.opened[0]?.[1].fsPath, file);
    assert.equal(h.calls.errors.length, 1);
});

test('read-only smoke search in the actual configured workspace directory', async t => {
    const search = manifest.contributes.configuration.properties['autoOpenExistingWorkspace.workspacesFolder'].default
        .replace(/\$\{env:([^}]+)\}/g, (_match, name) => process.env[name] ?? '');
    if (!fs.existsSync(search)) {
        t.skip('Configured workspace directory is not available on this machine.');
        return;
    }
    const h = harness(t, {
        search,
        root: path.resolve(__dirname, '..'),
        cancel: true,
        ignore: true,
        createWorkspaceIfMissing: false
    });
    await h.command();
    assert.equal(h.calls.notifications.length, 0);
    assert.equal(h.calls.opened.length, 0);
    const count = h.calls.picks[0]?.items.length ?? h.calls.confirmations.length;
    t.diagnostic(`Found ${count} matching workspace(s) for ${h.root}`);
    t.diagnostic(`Skipped ${h.calls.errors.length} unreadable or malformed candidates`);
});
