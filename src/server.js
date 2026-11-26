require('dotenv').config();

const config = require('./config');
const { createDatabase } = require('./db');
const createApp = require('./app');

const db = createDatabase(config);
const app = createApp(db);
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`CRM nội bộ đang chạy tại cổng ${config.port}.`);
});

const shutdown = (signal) => {
  console.log(`Nhận ${signal}, đang dừng máy chủ...`);

  server.close((serverError) => {
    if (serverError) {
      console.error('Không thể dừng HTTP server:', serverError);
      process.exitCode = 1;
    }

    try {
      db.close();
    } catch (databaseError) {
      console.error('Không thể đóng cơ sở dữ liệu SQLite:', databaseError);
      process.exitCode = 1;
    }

    process.exit();
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
