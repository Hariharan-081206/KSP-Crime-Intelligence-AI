import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset base is MANDATORY for Catalyst Web Client Hosting: the SPA is
  // served under a subpath (e.g. /app/), so absolute `/assets/...` URLs 404.
  // Combined with HashRouter (see src/App.jsx), deep links resolve on the static
  // host without server rewrites.
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    // Local dev: mirror the production API Gateway rule
    //   ANY /api/{path:(.*)} -> /server/scrb-backend/{path}
    // against a local `catalyst serve`, so `npm run dev` exercises exactly the
    // same paths the deployed SPA will. (Was pointed at a long-dead Flask
    // backend on :5000.) Start the backend first: `catalyst serve` from backend/.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/server/scrb-backend'),
      },
    },
  },
})
