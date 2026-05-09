/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#FFD700', dark: '#DAA520' },
        dark: { DEFAULT: '#0A0A0A', light: '#1A1A1A', card: '#121212' },
        gray: { DEFAULT: '#2D2D2D', light: '#3D3D3D' }
      }
    },
  },
  plugins: [],
}