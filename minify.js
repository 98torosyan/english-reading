// Shrinks index.html (HTML, CSS and JS) right before the site is published.
// Run:  npm i --no-save html-minifier-terser@7.2.0 && node minify.js
const fs = require("fs"), path = require("path");
const { minify } = require("html-minifier-terser");
(async () => {
  const file = path.join(__dirname, "index.html");
  const src = fs.readFileSync(file, "utf8");
  const out = await minify(src, {
    collapseWhitespace: true, conservativeCollapse: true, removeComments: true,
    ignoreCustomComments: [/^ data:/],              // the tests put the lesson data here
    minifyCSS: true,
    minifyJS: { compress: { passes: 2 }, mangle: true, format: { comments: false } },
    keepClosingSlash: true, decodeEntities: false
  });
  if (out.length < src.length * 0.4 || !out.includes("route()")) throw new Error("minified page looks wrong - keeping the original");
  fs.writeFileSync(file, out);
  console.log(`index.html: ${(src.length / 1024).toFixed(0)} KB -> ${(out.length / 1024).toFixed(0)} KB`);
})().catch(e => { console.error("minify skipped:", e.message); process.exit(1); });
