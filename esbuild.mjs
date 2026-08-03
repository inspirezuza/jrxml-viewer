import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const extensionContext = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  logLevel: 'info'
});

const webviewContext = await esbuild.context({
  entryPoints: ['src/webview/main.ts'],
  bundle: true,
  outfile: 'dist/webview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
  logLevel: 'info'
});

if (watch) {
  await extensionContext.watch();
  await webviewContext.watch();
  console.log('Watching for changes...');
} else {
  await extensionContext.rebuild();
  await webviewContext.rebuild();
  await extensionContext.dispose();
  await webviewContext.dispose();
}
