module.exports = {
    apps: [{
        name: 'touping',
        script: './server.js',
        cwd: __dirname,
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
            PORT: 9123,
            PUBLIC_URL: 'https://touping.vv620.com'
        }
    }]
};
