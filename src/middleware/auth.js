function requireUser(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  res.locals.user = req.session.user;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) return res.redirect('/admin/login');
  res.locals.admin = req.session.admin;
  return next();
}

module.exports = { requireUser, requireAdmin };
