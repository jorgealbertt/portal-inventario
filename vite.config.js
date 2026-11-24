import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const installMarkup = readFileSync(new URL("./src/install-instructions.html", import.meta.url), "utf8");
const blindMarkup = readFileSync(new URL("./src/blind-order-form.html", import.meta.url), "utf8");
const blindIntegration = readFileSync(new URL("./src/blind-app-integration.js", import.meta.url), "utf8");

function installInstructionsPlugin() {
  return {
    name: "cross-platform-install-instructions",
    transformIndexHtml(html) {
      const appleMeta = [
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
        '<meta name="apple-mobile-web-app-title" content="Pedidos">',
        '<link rel="apple-touch-icon" href="./apple-touch-icon.svg">'
      ].join("\n    ");
      if (!html.includes('<div class="add-box">')) {
        throw new Error("Could not find the catalog insertion point for the blind order form.");
      }
      return html
        .replace("</head>", `    ${appleMeta}\n  </head>`)
        .replace('<div class="add-box">', `${blindMarkup}\n            <div class="add-box">`)
        .replace("</body>", `    ${installMarkup}\n  </body>`);
    },
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/app.js")) return null;
      const importAnchor = 'import "./styles.css";';
      const handlerAnchor = '  $("exportButton").addEventListener("click", downloadOrder);';
      if (!code.includes(importAnchor) || !code.includes(handlerAnchor)) {
        throw new Error("Could not install the blind order controls in src/app.js.");
      }
      return code
        .replace(importAnchor, `${importAnchor}\nimport "./blinds.css";\nimport { BLIND_OPTIONS, createBlindProduct } from "./blinds.js";\n\n${blindIntegration}`)
        .replace(handlerAnchor, `  configureBlindOrderControls();\n${handlerAnchor}`);
    }
  };
}

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [installInstructionsPlugin()],
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: { output: { format: "iife" } }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
