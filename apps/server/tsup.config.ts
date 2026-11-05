import { defineConfig } from "tsup";
export default defineConfig({
  noExternal: [/^@cinema\//],
  external: ["@libsql/client"],
  sourcemap: true,
});
