/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#1d4ed8",
          700: "#1e40af",
        },
        slate: {
          850: "#1e2535",
        },
      },
    },
  },
  plugins: [],
};
