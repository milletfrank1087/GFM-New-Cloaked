module.exports = {
  content: ['./views/**/*.ejs'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#00b964',
          dark: '#02a95c',
          light: '#e8f8f0',
          muted: '#6b7280',
        }
      },
      fontFamily: {
        inter: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    }
  }
};
