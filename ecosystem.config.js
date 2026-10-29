module.exports = {
  apps: [
    {
      name: 'f-pac-store',
      script: 'build-server/server.cjs',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
