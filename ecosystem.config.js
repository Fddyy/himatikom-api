module.exports = {
    apps: [
      {
        name: "server",
        script: "app.js",
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: "500M",
      },
    ],
  };
  