module.exports = {
  apps: [
    {
      name: 'f-pac-store',
      script: 'dist/server.cjs',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
