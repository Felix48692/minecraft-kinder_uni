import { defineConfig } from 'vite'

// Dev server listens on the VM's open dev port so it is reachable in the browser.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      host: 'vcenv-vm-12.austriaeast.cloudapp.azure.com',
      clientPort: 8080,
      protocol: 'ws',
    },
  },
})
