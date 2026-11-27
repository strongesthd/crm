const PAGE_SIZE = 10;

const createPagination = ({ page, totalItems, basePath, filters = {} }) => {
  const parsedPage =
    typeof page === 'string' && /^[1-9]\d*$/.test(page) ? Number(page) : 1;
  const requestedPage = Number.isSafeInteger(parsedPage) ? parsedPage : 1;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;
  const query = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (typeof value === 'string' && value) {
      query.set(key, value);
    }
  });

  const getUrl = (pageNumber) => {
    const parameters = new URLSearchParams(query);
    parameters.set('page', String(pageNumber));

    return `${basePath}?${parameters.toString()}`;
  };
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return {
    currentPage,
    firstItem: totalItems === 0 ? 0 : offset + 1,
    lastItem: Math.min(offset + PAGE_SIZE, totalItems),
    nextUrl: currentPage < totalPages ? getUrl(currentPage + 1) : null,
    offset,
    pageSize: PAGE_SIZE,
    pages: pageNumbers.map((pageNumber) =>
      pageNumber === null
        ? null
        : { number: pageNumber, url: getUrl(pageNumber) },
    ),
    previousUrl: currentPage > 1 ? getUrl(currentPage - 1) : null,
    totalItems,
    totalPages,
  };
};

const getPageNumbers = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, null, totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      null,
      ...Array.from({ length: 5 }, (_, index) => totalPages - 4 + index),
    ];
  }

  return [1, null, currentPage - 1, currentPage, currentPage + 1, null, totalPages];
};

module.exports = { createPagination };
