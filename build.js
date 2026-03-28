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

// 2. Inline vendor scripts: replace <script src="vendor/..."> with inline <script>
const vendorRegex = /\s*<script\s+(?:defer\s+)?src="vendor\/([^"]+)"><\/script>/g;
const vendorFiles = [];
let vm;
const htmlForVendor = html;
while ((vm = vendorRegex.exec(htmlForVendor)) !== null) {
  vendorFiles.push(vm[1]);
}
if (vendorFiles.length > 0) {
  const vendorJs = vendorFiles.map(f => {
    return fs.readFileSync(path.join(ROOT, 'vendor', f), 'utf8');
  }).join('\n');
  let vReplaced = false;
  html = html.replace(/\s*<script\s+(?:defer\s+)?src="vendor\/[^"]+"><\/script>/g, (m) => {
    if (!vReplaced) { vReplaced = true; return `\n  <script>\n${vendorJs}\n  </script>`; }
    return '';
  });
  console.log(`  Vendor inlined: ${vendorFiles.join(', ')}`);
}

// 3. Collect all JS files referenced in <script src="js/..."> tags AND the dynamic loader
const allJsFiles = [];

// Find static script tags
const staticRegex = /\s*<script\s+(?:defer\s+)?src="js\/([^"]+)"><\/script>/g;
const htmlForStatic = html;
let sm;
while ((sm = staticRegex.exec(htmlForStatic)) !== null) {
  if (!allJsFiles.includes(sm[1])) allJsFiles.push(sm[1]);
}

// Find files in the dynamic loader script block
const loaderMatch = html.match(/var scripts\s*=\s*\[([\s\S]*?)\]/);
if (loaderMatch) {
  const fileRefs = loaderMatch[1].match(/'js\/([^']+)'/g);
  if (fileRefs) {
    for (const ref of fileRefs) {
      const fname = ref.replace(/^'js\//, '').replace(/'$/, '');
      if (!allJsFiles.includes(fname)) allJsFiles.push(fname);
    }
  }
}

// Critical scripts (loaded before idle)
const CRITICAL = new Set(['01-core.js', '15-project.js']);

if (allJsFiles.length > 0) {
  const criticalJs = [];
  const deferredJs = [];

  for (const f of allJsFiles) {
    const filePath = path.join(ROOT, 'js', f);
    const content = fs.readFileSync(filePath, 'utf8');
    const entry = `    // ── ${f} ──\n${content}`;
    if (CRITICAL.has(f)) {
      criticalJs.push(entry);
    } else {
      deferredJs.push(entry);
    }
  }

  const criticalBlock = criticalJs.join('\n\n');
  const deferredBlock = deferredJs.join('\n\n');

  // Remove static script tags
  html = html.replace(/\s*<script\s+(?:defer\s+)?src="js\/[^"]+"><\/script>/g, '');

  // Remove the dynamic loader script block
  html = html.replace(/\s*<script>\s*\(function\(\)\{[\s\S]*?var scripts[\s\S]*?\}\)\(\);\s*<\/script>/, '');

  // Insert combined script before </body>
  const combinedScript = `\n  <script>\n${criticalBlock}\n\n  var _idle = window.requestIdleCallback || function(cb){setTimeout(cb,50);};\n  _idle(function(){\n${deferredBlock}\n  });\n  </script>`;

  html = html.replace('</body>', `${combinedScript}\n</body>`);

  console.log(`  JS inlined from ${allJsFiles.length} files: ${allJsFiles.join(', ')}`);
}

// 4. Write output
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(OUT, html);

const sizeKB = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✓ Built: dist/index.html (${sizeKB} KB, ${html.split('\n').length} lines)`);
console.log(`  CSS inlined from css/styles.css`);
