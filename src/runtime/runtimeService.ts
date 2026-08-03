import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface RuntimeResult {
  outputPath: string;
  stdout: string;
  stderr: string;
}

function outputExtension(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === 'html') return '.html';
  if (normalized === 'xlsx') return '.xlsx';
  if (normalized === 'csv') return '.csv';
  if (normalized === 'docx') return '.docx';
  return '.pdf';
}

export class RuntimeNotConfiguredError extends Error {
  public constructor() {
    super('JRXML runtime command is not configured. Set jrxmlViewer.runtime.command to a local runner.');
  }
}

export class JrxmlRuntimeService {
  public async run(uri: vscode.Uri, format = 'pdf'): Promise<RuntimeResult> {
    const configuration = vscode.workspace.getConfiguration('jrxmlViewer.runtime');
    const command = configuration.get<string>('command', '').trim();
    if (!command) throw new RuntimeNotConfiguredError();
    const configuredArgs = configuration.get<string[]>('args', []);
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jrxml-viewer-'));
    await mkdir(tempRoot, { recursive: true });
    const outputPath = path.join(tempRoot, `${path.basename(uri.fsPath, path.extname(uri.fsPath))}${outputExtension(format)}`);
    const args = configuredArgs.map((argument) => argument.replaceAll('{input}', uri.fsPath).replaceAll('{output}', outputPath).replaceAll('{format}', format));
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(command, args, { cwd: path.dirname(uri.fsPath), windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${error.message}${stderr ? `\n${stderr}` : ''}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
    return { outputPath, ...result };
  }

  public async openResult(result: RuntimeResult): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.file(result.outputPath));
  }

  public async readResult(result: RuntimeResult): Promise<string> {
    return readFile(result.outputPath, 'utf8');
  }

  public async writeRequest(directory: string, name: string, content: string): Promise<string> {
    const file = path.join(directory, name);
    await writeFile(file, content, 'utf8');
    return file;
  }
}
