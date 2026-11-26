(() => {
  const currencyFormatter = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  });

  const refreshIcons = () => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  };

  const showToast = (message, icon = 'success') => {
    if (!window.Swal) {
      return;
    }

    window.Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2800,
      timerProgressBar: true,
    }).fire({ icon, title: message });
  };

  const flashElement = document.querySelector('[data-flash-message]');

  if (flashElement) {
    showToast(
      flashElement.dataset.flashMessage,
      flashElement.dataset.flashType === 'error' ? 'error' : 'success',
    );
  }

  document.querySelectorAll('[data-confirm-delete]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!window.Swal) {
        if (window.confirm(form.dataset.confirmMessage)) {
          form.submit();
        }

        return;
      }

      const result = await window.Swal.fire({
        title: 'Bạn chắc chắn chứ?',
        text: form.dataset.confirmMessage,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        reverseButtons: true,
      });

      if (result.isConfirmed) {
        form.submit();
      }
    });
  });

  const customerForm = document.getElementById('customer-form');

  if (customerForm) {
    const customerModalTitle = document.getElementById('customer-modal-title');
    const customerName = document.getElementById('customer-name');
    const customerPhone = document.getElementById('customer-phone');
    const customerEmail = document.getElementById('customer-email');
    const customerStatus = document.getElementById('customer-status');
    const customerNotes = document.getElementById('customer-notes');

    document.querySelectorAll('[data-customer-create]').forEach((button) => {
      button.addEventListener('click', () => {
        customerForm.action = '/customers';
        customerForm.reset();
        customerModalTitle.textContent = 'Thêm khách hàng';
      });
    });

    document.querySelectorAll('[data-customer-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const customer = JSON.parse(button.dataset.customerEdit);

        customerForm.action = `/customers/${customer.id}`;
        customerName.value = customer.name;
        customerPhone.value = customer.phone;
        customerEmail.value = customer.email;
        customerStatus.value = customer.status;
        customerNotes.value = customer.notes;
        customerModalTitle.textContent = 'Chỉnh sửa khách hàng';
      });
    });
  }

  const transactionForm = document.getElementById('transaction-form');

  if (transactionForm) {
    const modalTitle = document.getElementById('transaction-modal-title');
    const typeInput = document.getElementById('transaction-type');
    const amountInput = document.getElementById('transaction-amount');
    const categoryInput = document.getElementById('transaction-category');
    const dateInput = document.getElementById('transaction-date');
    const paymentStatusInput = document.getElementById(
      'transaction-payment-status',
    );
    const customerInput = document.getElementById('transaction-customer');
    const descriptionInput = document.getElementById(
      'transaction-description',
    );
    const submitLabel = document.getElementById('transaction-submit-label');

    document.querySelectorAll('[data-transaction-create]').forEach((button) => {
      button.addEventListener('click', () => {
        transactionForm.action = '/transactions';
        transactionForm.reset();
        modalTitle.textContent = 'Thêm giao dịch';
        submitLabel.textContent = 'Tạo phiếu';
        dateInput.value = new Date().toISOString().slice(0, 10);
      });
    });

    document.querySelectorAll('[data-transaction-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const transaction = JSON.parse(button.dataset.transactionEdit);

        transactionForm.action = `/transactions/${transaction.id}`;
        typeInput.value = transaction.type;
        amountInput.value = transaction.amount;
        categoryInput.value = transaction.category;
        dateInput.value = transaction.transactionDate;
        paymentStatusInput.value = transaction.paymentStatus;
        customerInput.value = transaction.customerId ?? '';
        descriptionInput.value = transaction.description;
        modalTitle.textContent = `Sửa phiếu #${transaction.id}`;
        submitLabel.textContent = 'Lưu thay đổi';
      });
    });
  }

  const transactionDetailsModal = document.getElementById(
    'transaction-details-modal',
  );

  if (transactionDetailsModal) {
    document.querySelectorAll('[data-transaction-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const transaction = JSON.parse(button.dataset.transactionView);
        const approvalLabels = {
          APPROVED: 'Đã duyệt',
          PENDING: 'Chờ duyệt',
          REJECTED: 'Từ chối',
        };
        const typeLabel = transaction.type === 'THU' ? 'Thu' : 'Chi';
        const amountPrefix = transaction.type === 'THU' ? '+' : '−';

        document.getElementById('transaction-details-title').textContent =
          `Chi tiết phiếu #${transaction.id}`;
        document.getElementById('transaction-details-type').textContent =
          typeLabel;
        document.getElementById('transaction-details-amount').textContent =
          `${amountPrefix}${transaction.formattedAmount}`;
        document.getElementById('transaction-details-date').textContent =
          transaction.formattedDate;
        document.getElementById('transaction-details-category').textContent =
          transaction.category;
        document.getElementById('transaction-details-customer').textContent =
          transaction.customerName;
        document.getElementById('transaction-details-payment').textContent =
          transaction.paymentStatus;
        document.getElementById('transaction-details-approval').textContent =
          approvalLabels[transaction.approvalStatus];
        document.getElementById('transaction-details-creator').textContent =
          transaction.creatorName;
        document.getElementById('transaction-details-reviewer').textContent =
          transaction.reviewerName;
        document.getElementById('transaction-details-description').textContent =
          transaction.description || 'Không có diễn giải';

        const rejectionContainer = document.getElementById(
          'transaction-details-rejection-container',
        );
        rejectionContainer.classList.toggle(
          'hidden',
          !transaction.rejectionReason,
        );
        document.getElementById('transaction-details-rejection').textContent =
          transaction.rejectionReason;

        refreshIcons();
      });
    });
  }

  const userActionModal = document.getElementById('user-action-modal');

  if (userActionModal) {
    const userProfileForm = document.getElementById('user-profile-form');
    const userRoleForm = document.getElementById('user-role-form');
    const userApprovalForm = document.getElementById('user-approval-form');
    const userStatusForm = document.getElementById('user-status-form');

    document.querySelectorAll('[data-user-open]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = JSON.parse(button.dataset.userOpen);

        document.getElementById('user-action-title').textContent =
          user.fullName;
        document.getElementById('user-action-subtitle').textContent =
          `${user.username} · ${user.roleLabel}`;

        userProfileForm.action = `/users/${user.id}`;
        userProfileForm.elements.fullName.value = user.fullName;
        userProfileForm.elements.username.value = user.username;
        userProfileForm.elements.password.value = '';
        userProfileForm.elements.passwordConfirmation.value = '';

        userRoleForm.action = `/users/${user.id}/role`;
        userRoleForm.elements.role.value = user.role;
        userRoleForm.classList.toggle('hidden', user.role === 'admin');

        userApprovalForm.action = `/users/${user.id}/approval-permission`;
        userApprovalForm.elements.canApprove.checked = user.canApprove;
        userApprovalForm.classList.toggle('hidden', user.role === 'admin');

        userStatusForm.action = `/users/${user.id}/status`;
        userStatusForm.classList.toggle('hidden', user.isSelf);
        document.getElementById('user-status-description').textContent =
          user.isActive
            ? 'Khóa tài khoản sẽ chặn đăng nhập và kết thúc các phiên hoạt động.'
            : 'Kích hoạt tài khoản để nhân viên có thể đăng nhập lại.';
        const statusButton = document.getElementById('user-status-button');
        statusButton.textContent = user.isActive
          ? 'Khóa tài khoản'
          : 'Kích hoạt tài khoản';
        statusButton.className = user.isActive
          ? 'rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50'
          : 'rounded-lg border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50';

        refreshIcons();
      });
    });
  }

  const detailModalElement = document.getElementById('customer-details-modal');

  if (detailModalElement) {
    const detailsName = document.getElementById('customer-details-name');
    const detailsContact = document.getElementById(
      'customer-details-contact',
    );
    const detailsContent = document.getElementById(
      'customer-details-content',
    );

    document.querySelectorAll('[data-customer-details]').forEach((button) => {
      button.addEventListener('click', async () => {
        detailsContent.textContent = 'Đang tải thông tin...';

        try {
          const response = await fetch(
            `/customers/${encodeURIComponent(button.dataset.customerDetails)}/details`,
            {
              headers: { Accept: 'application/json' },
              credentials: 'same-origin',
            },
          );
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Không tải được thông tin khách hàng.');
          }

          detailsName.textContent = result.customer.name;
          detailsContact.textContent = [
            result.customer.phone,
            result.customer.email,
            result.customer.status,
          ]
            .filter(Boolean)
            .join(' · ');
          detailsContent.replaceChildren();

          const totals = document.createElement('div');
          totals.className = 'mb-6 grid gap-3 sm:grid-cols-2';
          totals.append(
            createSummaryCard('Tổng thu đã thanh toán', result.totals.paidIncome, 'text-emerald-700'),
            createSummaryCard('Công nợ tồn đọng', result.totals.outstanding, 'text-amber-700'),
          );
          detailsContent.append(totals);

          if (result.customer.notes) {
            const notes = document.createElement('p');
            notes.className = 'mb-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600';
            notes.textContent = `Ghi chú: ${result.customer.notes}`;
            detailsContent.append(notes);
          }

          const heading = document.createElement('h4');
          heading.className = 'mb-3 text-sm font-semibold text-slate-800';
          heading.textContent = 'Lịch sử giao dịch';
          detailsContent.append(heading);

          if (result.transactions.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'py-6 text-center text-sm text-slate-500';
            emptyMessage.textContent = 'Khách hàng chưa có giao dịch nào.';
            detailsContent.append(emptyMessage);
          } else {
            const tableContainer = document.createElement('div');
            tableContainer.className = 'overflow-x-auto';
            const table = document.createElement('table');
            table.className = 'data-table min-w-[600px]';
            const tableHead = document.createElement('thead');
            const headRow = document.createElement('tr');

            for (const label of [
              'Ngày',
              'Loại',
              'Diễn giải',
              'Số tiền',
              'Thanh toán',
              'Duyệt',
            ]) {
              const cell = document.createElement('th');
              cell.textContent = label;
              headRow.append(cell);
            }

            tableHead.append(headRow);
            const tableBody = document.createElement('tbody');

            for (const transaction of result.transactions) {
              const row = document.createElement('tr');
              const values = [
                transaction.formattedDate,
                transaction.type === 'THU' ? 'Thu' : 'Chi',
                transaction.description || transaction.category,
                transaction.formattedAmount,
                transaction.payment_status,
                transaction.approval_status === 'PENDING'
                  ? 'Chờ duyệt'
                  : transaction.approval_status === 'REJECTED'
                    ? `Từ chối: ${transaction.rejection_reason}`
                    : 'Đã duyệt',
              ];

              for (const value of values) {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
              }

              tableBody.append(row);
            }

            table.append(tableHead, tableBody);
            tableContainer.append(table);
            detailsContent.append(tableContainer);
          }

          refreshIcons();
        } catch (error) {
          detailsContent.textContent = error.message;
          showToast(error.message, 'error');
        }
      });
    });
  }

  const chartCanvas = document.getElementById('monthly-chart');

  if (chartCanvas && window.Chart) {
    const labels = JSON.parse(chartCanvas.dataset.labels);
    const income = JSON.parse(chartCanvas.dataset.income);
    const expenses = JSON.parse(chartCanvas.dataset.expenses);

    new window.Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tổng thu',
            data: income,
            backgroundColor: '#10b981',
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 30,
          },
          {
            label: 'Tổng chi',
            data: expenses,
            backgroundColor: '#fb7185',
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 30,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 20 },
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${currencyFormatter.format(context.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#64748b', font: { family: 'Inter' } },
          },
          y: {
            beginAtZero: true,
            border: { display: false, dash: [4, 4] },
            grid: { color: '#f1f5f9' },
            ticks: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 11 },
              callback: (value) => {
                const amount = Number(value);

                if (amount >= 1_000_000) {
                  return `${(amount / 1_000_000).toLocaleString('vi-VN')} tr`;
                }

                if (amount >= 1_000) {
                  return `${(amount / 1_000).toLocaleString('vi-VN')} nghìn`;
                }

                return amount.toLocaleString('vi-VN');
              },
            },
          },
        },
      },
    });
  }

  function createSummaryCard(label, value, valueClass) {
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-slate-200 bg-white p-4';
    const title = document.createElement('p');
    title.className = 'text-xs font-medium text-slate-500';
    title.textContent = label;
    const amount = document.createElement('p');
    amount.className = `mt-2 text-lg font-bold ${valueClass}`;
    amount.textContent = value;
    card.append(title, amount);

    return card;
  }

  refreshIcons();
})();
