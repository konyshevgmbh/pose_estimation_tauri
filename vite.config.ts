import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  clearScreen: false,
  plugins: [
    {
      // serve models/ directory at /models/* in dev, copy to dist in build
      name: "serve-models",
      configureServer(server) {
        server.middlewares.use("/models", (req, res, next) => {
          const file = path.join(process.cwd(), "models", req.url?.replace(/^\//, "") ?? "");
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.setHeader("Content-Type", "application/octet-stream");
            fs.createReadStream(file).pipe(res as any);
          } else {
            next();
          }
        });
      },
      closeBundle() {
        const src = path.join(process.cwd(), "models", "rtmpose.onnx");
        const dst = path.join(process.cwd(), "dist", "models", "rtmpose.onnx");
        if (fs.existsSync(src)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
        }
      },
    },
  ],
  server: {
    port: 5174,
    strictPort: true,
    host: host || "0.0.0.0",
    hmr: host ? { protocol: "ws", host, port: 1422 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
