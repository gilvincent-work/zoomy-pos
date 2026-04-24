const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');

// Copy manifest.json to dist
fs.copyFileSync(
  path.join(__dirname, '..', 'public', 'manifest.json'),
  path.join(distDir, 'manifest.json')
);

// Copy icon for PWA
const iconSrc = path.join(__dirname, '..', 'assets', 'icon.png');
const iconDest = path.join(distDir, 'assets', 'icon.png');
fs.mkdirSync(path.dirname(iconDest), { recursive: true });
fs.copyFileSync(iconSrc, iconDest);

// Inject manifest link and apple-touch-icon into index.html
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '<link rel="icon"',
    '<link rel="manifest" href="/manifest.json" />\n<link rel="apple-touch-icon" href="/assets/icon.png" />\n<link rel="icon"'
  );
  fs.writeFileSync(indexPath, html);
}

console.log('PWA patch applied: manifest.json injected into index.html');
