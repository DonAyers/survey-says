import { defineConfig, presetUno, presetAttributify } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetAttributify()],
  theme: {
    colors: {
      board: "#0a2a6e",
      boardCell: "#0e3a99",
      strike: "#c0392b",
    },
  },
  shortcuts: {
    btn: "px-4 py-2 rounded font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
    "btn-primary": "btn bg-emerald-600 hover:bg-emerald-500 text-white",
    "btn-danger": "btn bg-red-700 hover:bg-red-600 text-white",
    "btn-secondary": "btn bg-slate-600 hover:bg-slate-500 text-white",
  },
});
