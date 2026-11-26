const path = require('node:path');

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const sessionSecret = process.env.SESSION_SECRET ?? '';
const adminUser = process.env.ADMIN_USER?.trim() ?? '';
const adminPass = process.env.ADMIN_PASS ?? '';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT phải là số nguyên từ 1 đến 65535.');
}

if (sessionSecret.length < 32 || sessionSecret.startsWith('replace-with-')) {
  throw new Error(
    'SESSION_SECRET chưa an toàn. Hãy đặt chuỗi ngẫu nhiên dài ít nhất 32 ký tự trong .env.',
  );
}

if (
  adminUser.length < 3 ||
  adminPass.length < 12 ||
  adminPass.startsWith('replace-with-')
) {
  throw new Error(
    'Hãy đặt ADMIN_USER (ít nhất 3 ký tự) và ADMIN_PASS (ít nhất 12 ký tự) an toàn trong .env.',
  );
}

module.exports = {
  adminPass,
  adminUser,
  databasePath: path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data')),
  isProduction: process.env.NODE_ENV === 'production',
  port,
  sessionCookieSecure: process.env.SESSION_COOKIE_SECURE === 'true',
  sessionSecret,
};
