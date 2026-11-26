const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('node:path');

const config = require('./config');
const SQLiteSessionStore = require('./db/sqlite-session-store');
const createAuthRouter = require('./routes/auth');
const createCustomersRouter = require('./routes/customers');
const createDashboardRouter = require('./routes/dashboard');
const { createTransactionsRouter } = require('./routes/transactions');
const createUsersRouter = require('./routes/users');
const { requireAuthentication } = require('./middleware/auth');
const { ensureCsrfToken } = require('./middleware/csrf');
const { flashMiddleware } = require('./middleware/flash');
const { formatCurrency, formatDate, getInitials } = require('./utils/format');

const createApp = (db) => {
  const app = express();

  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          scriptSrc: [
            "'self'",
            "'unsafe-eval'",
            'https://cdn.jsdelivr.net',
            'https://cdn.tailwindcss.com',
            'https://unpkg.com',
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.jsdelivr.net',
            'https://fonts.googleapis.com',
          ],
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProduction ? '1d' : 0,
    etag: true,
  }));
  app.use(
    session({
      name: 'crm.sid',
      secret: config.sessionSecret,
      store: new SQLiteSessionStore(db),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        maxAge: 8 * 60 * 60 * 1000,
        sameSite: 'lax',
        secure: config.sessionCookieSecure,
      },
    }),
  );
  app.use(flashMiddleware);
  app.locals.formatCurrency = formatCurrency;
  app.locals.formatDate = formatDate;
  app.locals.getInitials = getInitials;

  app.use('/', createAuthRouter(db));
  app.use(requireAuthentication(db));
  app.use(ensureCsrfToken);
  app.use('/', createDashboardRouter(db));
  app.use('/customers', createCustomersRouter(db));
  app.use('/transactions', createTransactionsRouter(db));
  app.use('/users', createUsersRouter(db));

  app.use((_req, res) => {
    res.status(404).render('error', {
      title: 'Không tìm thấy trang',
      message: 'Trang bạn đang tìm không tồn tại.',
    });
  });

  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.status) ? error.status : 500;

    if (status >= 500) {
      console.error('Lỗi xử lý yêu cầu:', error);
    }

    if (res.headersSent) {
      return;
    }

    res.status(status).render('error', {
      title: status === 404 ? 'Không tìm thấy dữ liệu' : 'Có lỗi xảy ra',
      message:
        status >= 500
          ? 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại sau.'
          : error.message,
    });
  });

  return app;
};

module.exports = createApp;
