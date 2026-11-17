import { readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
let html = await readFile(resolve(dist, "index.html"), "utf8");

function assetPath(reference) {
  const path = resolve(dist, reference.replace(/^\.\//, ""));
  if (path !== dist && !path.startsWith(`${dist}${sep}`)) {
    throw new Error(`The built asset path is outside dist/: ${reference}`);
  }
  return path;
}

const scripts = [...html.matchAll(/<script\b(?=[^>]*\bsrc=["']([^"']+\.js)["'])[^>]*>\s*<\/script>/gi)];
if (scripts.length !== 1) {
  throw new Error("Could not find the single compiled application JavaScript bundle.");
}
for (const match of scripts) {
  const bundle = (await readFile(assetPath(match[1]), "utf8")).replace(/<\/script/gi, "<\\/script");
  html = html.replace(match[0], () => `<script>\n${bundle}\n</script>`);
}

html = html.replace(/<link\b(?=[^>]*\brel=["'](?:manifest|icon)["'])[^>]*>\s*/gi, "");
if (/<script\b[^>]*\bsrc=["']/i.test(html) || /<script\b[^>]*\btype=["']module["']/i.test(html) || /<link\b[^>]*\brel=["']stylesheet["']/i.test(html)) {
  throw new Error("The standalone portal must not depend on external scripts or stylesheets.");
}
await writeFile(resolve(root, "portal.html"), html);
console.log("Created portal.html. Open this single file to use the portal without a web server.");
