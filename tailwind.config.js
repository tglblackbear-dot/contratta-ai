/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#2563eb",
        ink: "#172033",
        muted: "#64748b",
        canvas: "#f7f8fa",
      },
    },
  },
  plugins: [],
};
