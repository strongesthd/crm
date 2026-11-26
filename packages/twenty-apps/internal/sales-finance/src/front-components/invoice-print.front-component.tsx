import { type CSSProperties, useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { useFrontComponentExecutionContext } from 'twenty-sdk/front-component';

import { INVOICE_PRINT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

type CurrencyValue = {
  amountMicros?: number | null;
  currencyCode?: string | null;
} | null;

type InvoiceLine = {
  id: string;
  name?: string | null;
  quantity?: number | null;
  product?: { name?: string | null } | null;
  unitPrice?: CurrencyValue;
  lineTotal?: CurrencyValue;
};

type InvoiceRecord = {
  name?: string | null;
  issuedDate?: string | null;
  dueDate?: string | null;
  subtotal?: CurrencyValue;
  taxAmount?: CurrencyValue;
  totalAmount?: CurrencyValue;
  paidAmount?: CurrencyValue;
  salesOrder?: {
    name?: string | null;
    customer?: { name?: string | null } | null;
    orderLines?: {
      edges?: Array<{ node: InvoiceLine }> | null;
    } | null;
  } | null;
};

const styles: Record<string, CSSProperties> = {
  container: {
    height: '100%',
    overflow: 'auto',
    padding: '24px',
    background: '#f5f6f8',
    fontFamily: 'Arial, sans-serif',
    color: '#202124',
  },
  toolbar: {
    maxWidth: '780px',
    margin: '0 auto 16px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  button: {
    border: '0',
    borderRadius: '6px',
    padding: '10px 16px',
    background: '#215eef',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  sheet: {
    maxWidth: '780px',
    minHeight: '700px',
    margin: '0 auto',
    padding: '48px',
    background: '#fff',
    boxSizing: 'border-box',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
  },
  heading: {
    margin: '0 0 8px',
    fontSize: '28px',
  },
  subtitle: {
    margin: '0 0 28px',
    color: '#5f6368',
  },
  details: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px 24px',
    marginBottom: '28px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '24px',
    textAlign: 'left',
  },
  cell: {
    borderBottom: '1px solid #e5e7eb',
    padding: '10px 8px',
  },
  totals: {
    width: '280px',
    marginLeft: 'auto',
  },
  total: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  grandTotal: {
    borderTop: '1px solid #202124',
    marginTop: '8px',
    paddingTop: '12px',
    fontWeight: 700,
  },
  notice: {
    marginTop: '40px',
    color: '#5f6368',
    fontSize: '12px',
  },
  message: {
    maxWidth: '780px',
    margin: '0 auto',
    padding: '32px',
    background: '#fff',
    color: '#5f6368',
  },
};

const useCurrentInvoiceId = (): string | null =>
  useFrontComponentExecutionContext(
    (context) =>
      context.recordId ??
      (context.selectedRecordIds.length === 1
        ? context.selectedRecordIds[0]
        : null),
  );

const formatCurrency = (value: CurrencyValue | undefined): string => {
  if (
    !value ||
    typeof value.amountMicros !== 'number' ||
    !Number.isFinite(value.amountMicros)
  ) {
    return '—';
  }

  const currencyCode = value.currencyCode ?? 'VND';

  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currencyCode,
    }).format(value.amountMicros / 1_000_000);
  } catch {
    return `${(value.amountMicros / 1_000_000).toLocaleString('vi-VN')} ${currencyCode}`;
  }
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN').format(date);
};

const InvoicePrint = () => {
  const invoiceId = useCurrentInvoiceId();
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null);
      setLoading(false);

      return;
    }

    let cancelled = false;

    setInvoice(null);
    setErrorMessage(null);
    setLoading(true);

    const loadInvoice = async () => {
      try {
        const result = await new CoreApiClient().query({
          internalInvoices: {
            __args: { filter: { id: { eq: invoiceId } }, first: 1 },
            edges: {
              node: {
                name: true,
                issuedDate: true,
                dueDate: true,
                subtotal: { amountMicros: true, currencyCode: true },
                taxAmount: { amountMicros: true, currencyCode: true },
                totalAmount: { amountMicros: true, currencyCode: true },
                paidAmount: { amountMicros: true, currencyCode: true },
                salesOrder: {
                  name: true,
                  customer: { name: true },
                  orderLines: {
                    edges: {
                      node: {
                        id: true,
                        name: true,
                        quantity: true,
                        product: { name: true },
                        unitPrice: {
                          amountMicros: true,
                          currencyCode: true,
                        },
                        lineTotal: {
                          amountMicros: true,
                          currencyCode: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const invoiceResponse = result as {
          internalInvoices?: {
            edges?: Array<{ node?: InvoiceRecord | null }> | null;
          } | null;
        };
        const loadedInvoice =
          invoiceResponse.internalInvoices?.edges?.[0]?.node ?? null;

        if (!loadedInvoice) {
          throw new Error('Không tìm thấy hóa đơn này.');
        }

        if (!cancelled) {
          setInvoice(loadedInvoice);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Không tải được hóa đơn.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadInvoice();

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (loading || !invoice) {
    return (
      <div style={styles.message}>
        {loading
          ? 'Đang tải hóa đơn...'
          : (errorMessage ?? 'Mở một hóa đơn để xem bản in.')}
      </div>
    );
  }

  const lines = invoice.salesOrder?.orderLines?.edges ?? [];

  return (
    <div style={styles.container}>
      <style>
        {'@media print { body { background: white !important; } .invoice-print-toolbar { display: none !important; } .invoice-print-container { padding: 0 !important; background: white !important; } .invoice-print-sheet { box-shadow: none !important; max-width: none !important; min-height: 0 !important; } }'}
      </style>
      <div className="invoice-print-toolbar" style={styles.toolbar}>
        <button
          type="button"
          style={styles.button}
          onClick={() => window.print()}
        >
          In / Lưu PDF
        </button>
      </div>
      <article className="invoice-print-sheet" style={styles.sheet}>
        <h1 style={styles.heading}>Hóa đơn bán hàng</h1>
        <p style={styles.subtitle}>Chứng từ nội bộ</p>

        <section style={styles.details}>
          <div>
            <strong>Số hóa đơn:</strong> {invoice.name ?? '—'}
          </div>
          <div>
            <strong>Đơn bán hàng:</strong> {invoice.salesOrder?.name ?? '—'}
          </div>
          <div>
            <strong>Khách hàng:</strong>{' '}
            {invoice.salesOrder?.customer?.name ?? '—'}
          </div>
          <div>
            <strong>Ngày phát hành:</strong> {formatDate(invoice.issuedDate)}
          </div>
          <div>
            <strong>Hạn thanh toán:</strong> {formatDate(invoice.dueDate)}
          </div>
        </section>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.cell}>Sản phẩm/dịch vụ</th>
              <th style={styles.cell}>Số lượng</th>
              <th style={styles.cell}>Đơn giá</th>
              <th style={styles.cell}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td style={styles.cell} colSpan={4}>
                  Chưa có dòng hàng trong đơn bán hàng.
                </td>
              </tr>
            ) : (
              lines.map(({ node }) => (
                <tr key={node.id}>
                  <td style={styles.cell}>
                    {node.product?.name ?? node.name ?? '—'}
                  </td>
                  <td style={styles.cell}>{node.quantity ?? '—'}</td>
                  <td style={styles.cell}>{formatCurrency(node.unitPrice)}</td>
                  <td style={styles.cell}>{formatCurrency(node.lineTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <section style={styles.totals}>
          <div style={styles.total}>
            <span>Tiền hàng</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div style={styles.total}>
            <span>Thuế</span>
            <span>{formatCurrency(invoice.taxAmount)}</span>
          </div>
          <div style={{ ...styles.total, ...styles.grandTotal }}>
            <span>Tổng cộng</span>
            <span>{formatCurrency(invoice.totalAmount)}</span>
          </div>
          <div style={styles.total}>
            <span>Đã thu</span>
            <span>{formatCurrency(invoice.paidAmount)}</span>
          </div>
        </section>

        <p style={styles.notice}>
          Đây là chứng từ nội bộ, không phải hóa đơn điện tử có giá trị pháp lý.
        </p>
      </article>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: INVOICE_PRINT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'invoice-print',
  description: 'Xem, in hoặc lưu hóa đơn nội bộ thành PDF.',
  component: InvoicePrint,
});
