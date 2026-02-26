import react from "@vitejs/plugin-react";
import { type ConfigEnv, defineConfig } from "vite";

// https://vite.dev/config/
export default ({ command }: ConfigEnv) => {
  const isDev = command === "serve";
  return defineConfig({
    plugins: [react()],
    base: isDev ? "" : "test_websocket/dist/",
  });
};
