const { PRIVILEGED_USER_ROLES } = require('../db');

const requireAuthentication = (db) => (req, res, next) => {
  const sessionUser = req.session.user;

  if (!sessionUser) {
    res.redirect('/login');

    return;
  }

  const user = db
    .prepare(
      `SELECT id, username, full_name AS fullName, role,
        is_active AS isActive
       FROM users
       WHERE id = ?`,
    )
    .get(sessionUser.id);

  if (!user || !user.isActive) {
    req.session.destroy((error) => {
      if (error) {
        next(error);

        return;
      }

      res.clearCookie('crm.sid');
      res.redirect('/login');
    });

    return;
  }

  req.currentUser = {
    ...user,
    isAdmin: PRIVILEGED_USER_ROLES.includes(user.role),
  };
  req.session.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
  };
  res.locals.currentUser = req.currentUser;

  next();
};

const requireRoles = (...roles) => (req, res, next) => {
  const hasRole =
    req.currentUser &&
    (roles.includes(req.currentUser.role) ||
      (req.currentUser.isAdmin && roles.includes('admin')));

  if (!hasRole) {
    next(Object.assign(new Error('Bạn không có quyền thực hiện thao tác này.'), {
      status: 403,
    }));

    return;
  }

  next();
};

module.exports = {
  requireAuthentication,
  requireRoles,
};
