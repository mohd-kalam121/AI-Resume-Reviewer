'use strict';

const config = require('./config');
const { createApp } = require('./app');

function start() {
    const app = createApp();
    const server = app.listen(config.port);

    // Bind failures arrive as an 'error' event, not as an exception from
    // listen(). Without this handler the process falls through to the success
    // path and dies on server.address() being null, which reports a confusing
    // TypeError instead of the actual cause.
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(
                `[server] port ${config.port} is already in use.\n` +
                `         Stop whatever is using it, or start on another port:\n` +
                `         PORT=5001 npm run dev`
            );
        } else if (error.code === 'EACCES') {
            console.error(`[server] permission denied binding to port ${config.port}.`);
        } else {
            console.error('[server] failed to start:', error.message);
        }
        process.exit(1);
    });

    server.on('listening', () => {
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
