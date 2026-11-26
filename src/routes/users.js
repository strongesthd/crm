const bcrypt = require('bcryptjs');
const express = require('express');

const { USER_ROLES } = require('../db');
const { requireRoles } = require('../middleware/auth');
const { setFlash } = require('../middleware/flash');
const { readUserProfile } = require('../utils/user-profile');

const USER_ROLE_LABELS = {
  admin: 'Quản trị viên',
  accountant: 'Kế toán',
  cashier: 'Thủ quỹ',
};
const USER_ROLE_OPTIONS = USER_ROLES.map((role) => ({
  value: role,
  label: USER_ROLE_LABELS[role],
}));

const createUsersRouter = (db) => {
  const router = express.Router();

  router.use(requireRoles('admin'));

  router.get('/', (req, res) => {
    const users = db
      .prepare(
        `SELECT id, username, full_name AS fullName, role,
          can_approve AS canApprove, is_active AS isActive, created_at AS createdAt
         FROM users
         ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, full_name COLLATE NOCASE`,
      )
      .all()
      .map((user) => {
        const formattedUser = {
          ...user,
          canApprove: Boolean(user.canApprove),
          isActive: Boolean(user.isActive),
          roleLabel: getRoleLabel(user.role),
        };

        return {
          ...formattedUser,
          detailsJson: JSON.stringify({
            id: user.id,
            fullName: user.fullName,
            username: user.username,
            role: user.role,
            roleLabel: formattedUser.roleLabel,
            canApprove: formattedUser.canApprove,
            isActive: formattedUser.isActive,
            isSelf: user.id === req.currentUser.id,
          }),
        };
      });

    res.render('users', {
      title: 'Quản lý người dùng',
      activePage: 'users',
      users,
      userRoles: USER_ROLE_OPTIONS,
    });
  });

  router.post('/', (req, res) => {
    const user = readNewUser(req.body);
    const existingUser = db
      .prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE')
      .get(user.username);

    if (existingUser) {
      throw createHttpError(409, 'Tên đăng nhập này đã được sử dụng.');
    }

    try {
      db.prepare(
        `INSERT INTO users
          (username, password_hash, full_name, role, can_approve, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
      ).run(
        user.username,
        bcrypt.hashSync(user.password, 12),
        user.fullName,
        user.role,
        user.canApprove ? 1 : 0,
      );
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw createHttpError(409, 'Tên đăng nhập này đã được sử dụng.');
      }

      throw error;
    }

    setFlash(req, 'success', `Đã tạo tài khoản ${user.username}.`);
    res.redirect('/users');
  });

  router.post('/:id', (req, res) => {
    const userId = parseRecordId(req.params.id);
    const existingUser = db
      .prepare('SELECT id FROM users WHERE id = ?')
      .get(userId);

    if (!existingUser) {
      throw createHttpError(404, 'Không tìm thấy tài khoản.');
    }

    const user = readUserProfile(req.body);
    const usernameInUse = db
      .prepare(
        `SELECT 1 FROM users
         WHERE username = ? COLLATE NOCASE AND id != ?`,
      )
      .get(user.username, userId);

    if (usernameInUse) {
      throw createHttpError(409, 'Tên đăng nhập này đã được sử dụng.');
    }

    try {
      if (user.password) {
        db.prepare(
          `UPDATE users
           SET full_name = ?, username = ?, password_hash = ?
           WHERE id = ?`,
        ).run(
          user.fullName,
          user.username,
          bcrypt.hashSync(user.password, 12),
          userId,
        );
      } else {
        db.prepare(
          `UPDATE users
           SET full_name = ?, username = ?
           WHERE id = ?`,
        ).run(user.fullName, user.username, userId);
      }
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw createHttpError(409, 'Tên đăng nhập này đã được sử dụng.');
      }

      throw error;
    }

    setFlash(req, 'success', 'Đã cập nhật thông tin tài khoản.');
    res.redirect('/users');
  });

  router.post('/:id/approval-permission', (req, res) => {
    const userId = parseRecordId(req.params.id);
    const user = db
      .prepare('SELECT id, role FROM users WHERE id = ?')
      .get(userId);

    if (!user || user.role === 'admin') {
      throw createHttpError(404, 'Không tìm thấy tài khoản nhân viên.');
    }

    db.prepare('UPDATE users SET can_approve = ? WHERE id = ?').run(
      req.body.canApprove === 'on' ? 1 : 0,
      userId,
    );

    setFlash(req, 'success', 'Đã cập nhật quyền duyệt phiếu.');
    res.redirect('/users');
  });

  router.post('/:id/role', (req, res) => {
    const userId = parseRecordId(req.params.id);
    const user = db
      .prepare('SELECT id, role FROM users WHERE id = ?')
      .get(userId);
    const role = typeof req.body.role === 'string' ? req.body.role : '';

    if (!user || user.role === 'admin') {
      throw createHttpError(404, 'Không tìm thấy tài khoản nhân viên.');
    }

    if (!USER_ROLES.includes(role)) {
      throw createHttpError(400, 'Chức danh nhân viên không hợp lệ.');
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);

    setFlash(req, 'success', 'Đã cập nhật chức danh nhân viên.');
    res.redirect('/users');
  });

  router.post('/:id/status', (req, res) => {
    const userId = parseRecordId(req.params.id);
    const user = db
      .prepare('SELECT id, role, is_active FROM users WHERE id = ?')
      .get(userId);

    if (!user) {
      throw createHttpError(404, 'Không tìm thấy tài khoản.');
    }

    if (userId === req.currentUser.id) {
      throw createHttpError(400, 'Bạn không thể khóa tài khoản đang sử dụng.');
    }

    const isActive = Boolean(user.is_active);

    if (isActive && user.role === 'admin') {
      const activeAdminCount = db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1")
        .get().count;

      if (activeAdminCount <= 1) {
        throw createHttpError(400, 'Không thể khóa tài khoản quản trị viên cuối cùng.');
      }
    }

    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(
      isActive ? 0 : 1,
      userId,
    );

    setFlash(
      req,
      'success',
      isActive ? 'Đã khóa tài khoản.' : 'Đã kích hoạt tài khoản.',
    );
    res.redirect('/users');
  });

  return router;
};

const readNewUser = (body) => {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const username =
    typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = typeof body.role === 'string' ? body.role : '';

  if (!fullName || fullName.length > 120) {
    throw createHttpError(400, 'Họ tên là bắt buộc và tối đa 120 ký tự.');
  }

  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) {
    throw createHttpError(
      400,
      'Tên đăng nhập phải có 3-80 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.',
    );
  }

  if (password.length < 12 || password.length > 128) {
    throw createHttpError(400, 'Mật khẩu phải có từ 12 đến 128 ký tự.');
  }

  if (!USER_ROLES.includes(role)) {
    throw createHttpError(400, 'Chức danh nhân viên không hợp lệ.');
  }

  return {
    canApprove: body.canApprove === 'on',
    fullName,
    password,
    role,
    username,
  };
};

const getRoleLabel = (role) => {
  return USER_ROLE_LABELS[role] ?? role;
};

const parseRecordId = (value) => {
  const id = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw createHttpError(404, 'Không tìm thấy tài khoản.');
  }

  return id;
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = createUsersRouter;
