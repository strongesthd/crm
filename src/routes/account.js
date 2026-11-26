const bcrypt = require('bcryptjs');
const express = require('express');

const { setFlash } = require('../middleware/flash');
const { readUserProfile } = require('../utils/user-profile');

const createAccountRouter = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.render('account', {
      title: 'Tài khoản của tôi',
      activePage: 'account',
    });
  });

  router.post('/', (req, res) => {
    const profile = readUserProfile(req.body);
    const currentUser = db
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .get(req.currentUser.id);

    if (!currentUser) {
      throw createHttpError(404, 'Không tìm thấy tài khoản.');
    }

    if (profile.password) {
      const currentPassword =
        typeof req.body.currentPassword === 'string'
          ? req.body.currentPassword
          : '';

      if (!bcrypt.compareSync(currentPassword, currentUser.password_hash)) {
        throw createHttpError(403, 'Mật khẩu hiện tại không chính xác.');
      }
    }

    const usernameInUse = db
      .prepare(
        `SELECT 1 FROM users
         WHERE username = ? COLLATE NOCASE AND id != ?`,
      )
      .get(profile.username, req.currentUser.id);

    if (usernameInUse) {
      throw createHttpError(409, 'Tên đăng nhập này đã được sử dụng.');
    }

    try {
      if (profile.password) {
        db.prepare(
          `UPDATE users
           SET full_name = ?, username = ?, password_hash = ?
           WHERE id = ?`,
        ).run(
          profile.fullName,
          profile.username,
          bcrypt.hashSync(profile.password, 12),
          req.currentUser.id,
        );
      } else {
        db.prepare(
          `UPDATE users
           SET full_name = ?, username = ?
           WHERE id = ?`,
        ).run(profile.fullName, profile.username, req.currentUser.id);
      }
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw createHttpError(409, 'Tên đăng nhập này đã được sử dụng.');
      }

      throw error;
    }

    setFlash(req, 'success', 'Đã cập nhật tài khoản của bạn.');
    res.redirect('/account');
  });

  return router;
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = createAccountRouter;
