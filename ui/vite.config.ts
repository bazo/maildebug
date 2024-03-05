import MillionLint from "@million/lint";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
const plugins = [react()];
if (process.env.NODE_ENV === "development") {
	plugins.push(MillionLint.vite());
}
export default defineConfig({
	plugins,
});
