const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");

const files = [
  "index.html",
  "styles.css",
  "theme.js",
  "i18n.js",
  "aiContract.js",
  "authLink.js",
  "cloud.js",
  "app.js",
];

const directories = ["vendor"];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const relativePath of files) {
  fs.copyFileSync(
    path.join(root, relativePath),
    path.join(output, relativePath)
  );
}

for (const relativePath of directories) {
  fs.cpSync(
    path.join(root, relativePath),
    path.join(output, relativePath),
    { recursive: true }
  );
}

console.log(`Built mobile web assets in ${path.relative(root, output)}/`);
