import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では https://<ユーザー>.github.io/<リポジトリ名>/ で配信されるので、
// ビルド時に BASE_PATH=/<リポジトリ名>/ を渡す（ローカルでは /）
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'きょうの服',
        short_name: 'きょうの服',
        description: '今日の天気と手持ちの服から、服装を1つ提案します',
        lang: 'ja',
        display: 'standalone',
        background_color: '#f6f3ee',
        theme_color: '#f6f3ee',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
