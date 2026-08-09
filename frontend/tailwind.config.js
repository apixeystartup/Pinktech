/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
  /** Avoid resetting global styles for the rest of the admin shell. */
  corePlugins: {
    preflight: false,
  },
};
