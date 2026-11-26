const readUserProfile = (body) => {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const username =
    typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const passwordConfirmation =
    typeof body.passwordConfirmation === 'string'
      ? body.passwordConfirmation
      : '';

  if (!fullName || fullName.length > 120) {
    throw createHttpError(400, 'Họ tên là bắt buộc và tối đa 120 ký tự.');
  }

  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) {
    throw createHttpError(
      400,
      'Tên đăng nhập phải có 3-80 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.',
    );
  }

  if (password && (password.length < 12 || password.length > 128)) {
    throw createHttpError(400, 'Mật khẩu mới phải có từ 12 đến 128 ký tự.');
  }

  if (password !== passwordConfirmation) {
    throw createHttpError(400, 'Mật khẩu mới và xác nhận mật khẩu không khớp.');
  }

  return { fullName, password, username };
};

const createHttpError = (status, message) =>
  Object.assign(new Error(message), { status });

module.exports = { readUserProfile };
