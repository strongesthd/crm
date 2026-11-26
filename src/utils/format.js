const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const formatCurrency = (amount) => currencyFormatter.format(amount ?? 0);

const formatDate = (dateValue) => {
  if (!dateValue) {
    return '—';
  }

  const parsedDate = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
};

const getInitials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part.charAt(0).toLocaleUpperCase('vi-VN'))
    .join('');

module.exports = { formatCurrency, formatDate, getInitials };
