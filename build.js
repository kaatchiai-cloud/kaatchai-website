#!/usr/bin/env node
// build.js — Bundle Stori multi-file dev structure into single dist/index.html
// Usage: node build.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist', 'index.html');

// Read dev index.html
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1. Inline CSS: replace <link rel="stylesheet" href="css/styles.css"> with <style>...</style>
const cssPath = path.join(ROOT, 'css', 'styles.css');
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  html = html.replace(
    /\s*<link\s+rel="stylesheet"\s+href="css\/styles\.css"\s*\/?>/,
    `\n  <style>\n${css}\n  </style>`
  );
}

// 2. Inline JS: collect all <script src="js/..."> tags, replace with single <script> block
const jsTagRegex = /\s*<script\s+src="js\/([^"]+)"><\/script>/g;
const jsFiles = [];
let match;
const htmlCopy = html;
while ((match = jsTagRegex.exec(htmlCopy)) !== null) {
  jsFiles.push(match[1]);
}

if (jsFiles.length > 0) {
  // Build combined JS
  const allJs = jsFiles.map(f => {
    const filePath = path.join(ROOT, 'js', f);
    const content = fs.readFileSync(filePath, 'utf8');
    return `    // ── ${f} ──\n${content}`;
  }).join('\n\n');

  // Replace first js script tag with the combined inline script
  let replaced = false;
  html = html.replace(/\s*<script\s+src="js\/[^"]+"><\/script>/g, (m) => {
    if (!replaced) {
      replaced = true;
      return `\n  <script>\n${allJs}\n  </script>`;
    }
    return ''; // remove subsequent js script tags
  });
}

// 3. Write output
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(OUT, html);

const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ Built: dist/index.html (${sizeKB} KB, ${html.split('\n').length} lines)`);
console.log(`  CSS inlined from css/styles.css`);
console.log(`  JS inlined from ${jsFiles.length} files: ${jsFiles.join(', ')}`);
