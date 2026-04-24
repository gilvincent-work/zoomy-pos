const fs = require('fs');
const path = require('path');
const { generateSW } = require('workbox-build');

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

// Inject manifest link, apple-touch-icon, and SW registration into index.html
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('rel="manifest"')) {
  html = html.replace(
    '<link rel="icon"',
    '<link rel="manifest" href="/manifest.json" />\n<link rel="apple-touch-icon" href="/assets/icon.png" />\n<link rel="icon"'
  );
}
if (!html.includes('serviceWorker')) {
  html = html.replace(
    '</body>',
    `<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js');
    });
  }
</script>
</body>`
  );
}
fs.writeFileSync(indexPath, html);

// Generate service worker with Workbox
generateSW({
  globDirectory: distDir,
  // Precache app shell (JS bundles, HTML, manifest)
  globPatterns: [
    '**/*.html',
    '_expo/**/*.js',
    'manifest.json',
    'favicon.ico',
    'assets/icon.png',
  ],
  // Workbox ignores node_modules by default — clear it so we can runtime-cache those assets
  globIgnores: [],
  swDest: path.join(distDir, 'sw.js'),
  skipWaiting: true,
  clientsClaim: true,
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/_expo/, /\/assets\//],
  // Runtime-cache fonts, WASM, and images as they're requested (cache-first)
  runtimeCaching: [
    {
      urlPattern: /\/assets\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'zoomy-assets',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
  ],
}).then(({ count, size }) => {
  console.log(`PWA patch applied: manifest + SW generated (${count} files precached, assets runtime-cached)`);
});
