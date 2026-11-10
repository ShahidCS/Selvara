// Tailwind CSS 4 runs as a PostCSS plugin (its own package). It also adds vendor prefixes in production builds, so autoprefixer is not used.
module.exports = { plugins: { "@tailwindcss/postcss": {} } };
