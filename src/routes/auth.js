const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const { ensureCsrfToken, verifyCsrfToken } = require('../middleware/csrf');

const createAuthRouter = (db) => {
  const router = express.Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    },
  });

  router.get('/login', ensureCsrfToken, (req, res) => {
    if (req.session.user) {
      res.redirect('/');

      return;
    }

    res.render('login', {
      title: 'Đăng nhập',
      username: '',
      loginError: null,
    });
  });

  router.post(
    '/login',
    loginLimiter,
    verifyCsrfToken,
    (req, res, next) => {
      const username =
        typeof req.body.username === 'string' ? req.body.username.trim() : '';
      const password =
        typeof req.body.password === 'string' ? req.body.password : '';

      if (!username || !password) {
        res.status(400).render('login', {
          title: 'Đăng nhập',
          username,
          loginError: 'Vui lòng nhập tên đăng nhập và mật khẩu.',
        });

        return;
      }

      const user = db
        .prepare(
          `SELECT id, username, password_hash, full_name, is_active
           FROM users
           WHERE username = ? COLLATE NOCASE`,
        )
        .get(username);

      if (
        !user ||
        !user.is_active ||
        !bcrypt.compareSync(password, user.password_hash)
      ) {
        res.status(401).render('login', {
          title: 'Đăng nhập',
          username,
          loginError: 'Tên đăng nhập hoặc mật khẩu không chính xác.',
        });

        return;
      }

      req.session.regenerate((error) => {
        if (error) {
          next(error);

          return;
        }

        req.session.user = {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
        };
        req.session.csrfToken = randomBytes(32).toString('hex');
        req.session.save((saveError) => {
          if (saveError) {
            next(saveError);

            return;
          }

          res.redirect('/');
        });
      });
    },
  );

  router.post('/logout', verifyCsrfToken, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) {
        next(error);

        return;
      }

      res.clearCookie('crm.sid');
      res.redirect('/login');
    });
  });

  router.get('/healthz', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  return router;
};

module.exports = createAuthRouter;
