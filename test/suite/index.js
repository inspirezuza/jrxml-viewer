const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

async function run() {
  const extension = vscode.extensions.getExtension('jrxml-viewer-community.jrxml-viewer');
  assert.ok(extension, 'JRXML Viewer extension should be discoverable');
  await extension.activate();

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('jrxmlViewer.openPreview'));
  assert.ok(commands.includes('jrxmlViewer.validate'));
  assert.ok(commands.includes('jrxmlViewer.refreshExplorer'));

  const fixture = vscode.Uri.file(path.resolve(__dirname, '..', 'fixtures', 'sample.jrxml'));
  const document = await vscode.workspace.openTextDocument(fixture);
  assert.equal(document.languageId, 'jrxml');
  await vscode.commands.executeCommand('jrxmlViewer.validate', fixture);
}

module.exports.run = async function runAndExit() {
  try {
    await run();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
