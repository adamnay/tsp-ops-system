import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F1117',
        surface: '#1A1D27',
        surface2: '#21253A',
        border: '#2A2D3E',
        accent: '#00E5FF',
        accentDim: '#00B8CC',
        textPrimary: '#F0F2F8',
        textSecondary: '#8B91A8',
        textMuted: '#5A6080',
        success: '#00D084',
        warning: '#FFB800',
        error: '#FF4D6A',
        statusDraft: '#5A6080',
        statusActive: '#00D084',
        statusPending: '#FFB800',
        statusReceived: '#00E5FF',
        statusEscrowed: '#A78BFA',
        statusDisbursed: '#00D084',
        statusClosed: '#5A6080',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
