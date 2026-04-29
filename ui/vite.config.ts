import MillionLint from "@million/lint";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
const plugins = [react()];
if (process.env.MILLION_LINT_ENABLED === "1") {
	plugins.push(MillionLint.vite());
}
export default defineConfig({
	plugins,
});
