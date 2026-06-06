// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'
// import tailwindcss from "@tailwindcss/vite"
// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react(),tailwindcss()],
// })


import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        // In dev mode, Vite runs on :5173, backend on :3000
        // This proxy forwards /api calls and Socket.io WebSocket to the backend
        proxy: {
            '/api': {
                target:       'http://localhost:3000',
                changeOrigin: true,
            },
            '/socket.io': {
                target:       'http://localhost:3000',
                ws:           true,      // forward WebSocket connections too
                changeOrigin: true,
            }
        }
    }
})