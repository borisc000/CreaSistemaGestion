import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base works well for GitHub Pages project sites.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        tenders: resolve(__dirname, "licitaciones.html"),
        contracts: resolve(__dirname, "contratos.html"),
        operations: resolve(__dirname, "operaciones.html"),
        finance: resolve(__dirname, "finanzas.html"),
        hr: resolve(__dirname, "rrhh.html"),
        hrPeople: resolve(__dirname, "rrhh-personas.html"),
        architecture: resolve(__dirname, "arquitectura.html")
      }
    }
  }
});
