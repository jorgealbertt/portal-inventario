import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const installMarkup = readFileSync(new URL("./src/install-instructions.html", import.meta.url), "utf8");

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
      return html
        .replace("</head>", `    ${appleMeta}\n  </head>`)
        .replace("</body>", `    ${installMarkup}\n  </body>`);
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
