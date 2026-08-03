import type { SerializedModel } from '../core/types';

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'select'; id: string }
  | { type: 'revealSource'; start: number; end: number }
  | { type: 'openSource' }
  | { type: 'updateElement'; id: string; property: 'x' | 'y' | 'width' | 'height' | 'text' | 'expression' | 'style'; value: string | number }
  | { type: 'deleteElement'; id: string }
  | { type: 'duplicateElement'; id: string }
  | { type: 'addElement'; band: string; kind: string }
  | { type: 'setGrid'; enabled: boolean }
  | { type: 'export'; format: 'html' | 'svg'; content: string }
  | { type: 'validate' }
  | { type: 'runtimePreview'; format?: 'pdf' | 'html' | 'xlsx' | 'csv' };

export type ExtensionToWebviewMessage =
  | { type: 'model'; model: SerializedModel; selectedId?: string }
  | { type: 'selection'; id?: string }
  | { type: 'exportRequest'; format: 'html' | 'svg' }
  | { type: 'error'; message: string }
  | { type: 'runtimeStatus'; status: 'running' | 'success' | 'error'; message: string; outputPath?: string };

export function isWebviewMessage(value: unknown): value is WebviewToExtensionMessage {
  return Boolean(value && typeof value === 'object' && 'type' in value && typeof (value as { type?: unknown }).type === 'string');
}
