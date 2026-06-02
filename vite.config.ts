import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const normalizeBasePath = (value: string) => {
  if (/^https?:\/\//.test(value)) return value;
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

const defaultBasePath = process.env.GITHUB_PAGES === "true" ? "/block-simpler-engine-main/" : "/";
const basePath = normalizeBasePath(process.env.VITE_BASE_PATH ?? defaultBasePath);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: basePath,
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
