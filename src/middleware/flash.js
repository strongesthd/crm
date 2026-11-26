const flashMiddleware = (req, res, next) => {
  res.locals.flash = req.session.flash ?? null;
  delete req.session.flash;
  res.locals.currentUser = req.session.user ?? null;
  next();
};

const setFlash = (req, type, message) => {
  req.session.flash = { type, message };
};

module.exports = { flashMiddleware, setFlash };
