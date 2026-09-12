'use strict';

const config = require('./config');
const { createApp } = require('./app');

function start() {
    const app = createApp();
    const server = app.listen(config.port, () => {
        console.log(`[server] listening on port ${server.address().port} (${config.env})`);
    });

    process.on('SIGTERM', () => shutdown(server));
    process.on('SIGINT', () => shutdown(server));

    return server;
}

function shutdown(server) {
    console.log('[server] shutting down...');
    server.close(() => process.exit(0));
}

module.exports = { start };

if (require.main === module) start();
