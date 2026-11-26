const { randomBytes, timingSafeEqual } = require('node:crypto');

const ensureCsrfToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;
  next();
};

const verifyCsrfToken = (req, res, next) => {
  const suppliedToken = req.body?._csrf;
  const expectedToken = req.session.csrfToken;

  res.locals.csrfToken = expectedToken;

  if (
    typeof suppliedToken !== 'string' ||
    typeof expectedToken !== 'string' ||
    suppliedToken.length !== expectedToken.length ||
    !timingSafeEqual(Buffer.from(suppliedToken), Buffer.from(expectedToken))
  ) {
    res.status(403).render('error', {
      title: 'Yêu cầu không hợp lệ',
      message: 'Phiên biểu mẫu đã hết hạn. Vui lòng tải lại trang rồi thử lại.',
    });

    return;
  }

  next();
};

module.exports = { ensureCsrfToken, verifyCsrfToken };
