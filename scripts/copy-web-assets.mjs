import * as fs from 'node:fs';
import * as path from 'node:path';

const srcDir = path.resolve(process.cwd(), 'web');
const destDir = path.resolve(process.cwd(), 'dist', 'web');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    // Only copy non-typescript files
    if (!src.endsWith('.ts')) {
      fs.copyFileSync(src, dest);
    }
  }
}

copyRecursive(srcDir, destDir);

// Copy example capture fixture if available
const exampleSrc = path.resolve(process.cwd(), 'captures', 'calc-test.png');
const exampleDestDir = path.resolve(destDir, 'assets');
if (fs.existsSync(exampleSrc)) {
  if (!fs.existsSync(exampleDestDir)) fs.mkdirSync(exampleDestDir, { recursive: true });
  fs.copyFileSync(exampleSrc, path.join(exampleDestDir, 'calc-test.png'));
  console.log('[Assets] Example screenshot fixture copied to dist/web/assets/calc-test.png');
}

console.log('[Assets] Static web companion assets, styles, and fonts copied to dist/web');
