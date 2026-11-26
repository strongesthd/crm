Hãy đóng vai một Senior Full-stack Developer & UI/UX Designer, xây dựng cho tôi một ứng dụng web quản lý CRM cơ bản kết hợp Sổ Thu Chi nội bộ (tên dự án: `internal-crm-finance`).

### 1. Yêu cầu công nghệ (Tech Stack - Siêu nhẹ cho VPS)
- **Backend:** Node.js (v20+), Express.js.
- **Database:** SQLite sử dụng `better-sqlite3` (lưu tại `./data/database.sqlite`). Tự động khởi tạo bảng và dữ liệu mẫu (seed data) tiếng Việt sinh động nếu chưa có database.
- **Thư viện Giao diện (UI/UX - Nhúng qua CDN để không cần bước build phức tạp):**
  - **Tailwind CSS** + **Flowbite (CSS & JS CDN)**: Dùng các component chuẩn của Flowbite cho Sidebar, Modal, Dropdown, Bảng dữ liệu (Table) và Badge.
  - **Google Fonts (`Inter` hoặc `Plus Jakarta Sans`)**: Font chữ hiện đại, hiển thị dấu tiếng Việt sắc nét.
  - **Lucide Icons (`lucide` CDN)**: Bộ icon nét mảnh đồng bộ.
  - **Chart.js (CDN)**: Biểu đồ cột bo góc (rounded bars) trực quan, có tooltip định dạng tiền VNĐ.
  - **SweetAlert2 (CDN)**: Hiển thị hộp thoại xác nhận xóa đẹp mắt và thông báo góc màn hình (Toast) mượt mà mỗi khi thêm/sửa/xóa thành công.
- **Bảo mật & Triển khai:** `dotenv`, `express-session`, `bcryptjs`, `helmet`, `express-rate-limit`. Tạo sẵn `Dockerfile` (`node:20-alpine`) và `docker-compose.yml` mount volume `./data:/app/data`.

### 2. Tiêu chuẩn Thiết kế Giao diện (UI/UX Design System)
- **Phong cách:** Hiện đại chuẩn SaaS B2B (tương tự Stripe / Linear / Twenty CRM). Nền tổng thể màu xám nhạt dịu mắt (`bg-slate-50`), các thẻ nội dung màu trắng (`bg-white`) bo góc mềm mại (`rounded-xl`), viền mảnh (`border-slate-200/80`) và đổ bóng nhẹ (`shadow-sm`).
- **Màu sắc ngữ nghĩa:** Màu chủ đạo Indigo/Blue (`indigo-600`). Khoản **Thu** dùng tông xanh ngọc (`emerald-600`, nền `emerald-50`), khoản **Chi** dùng tông đỏ hồng (`rose-600`, nền `rose-50`), **Công nợ** dùng tông vàng hổ phách (`amber-600`, nền `amber-50`).
- **Bố cục (Layout):** Sidebar cố định bên trái (rộng 256px) có logo, tên ứng dụng, menu điều hướng rõ ràng và nút đăng xuất ở đáy; trên Mobile tự động biến thành Drawer trượt ra khi bấm nút menu.
- **100% Tiếng Việt:** Toàn bộ giao diện, thông báo, định dạng tiền (`15.000.000 ₫`) và ngày tháng (`DD/MM/YYYY`) đều chuẩn tiếng Việt.

### 3. Cấu trúc Database (SQLite)
1. `users`: `id`, `username`, `password_hash`, `full_name`, `created_at` (Tự động tạo admin mặc định từ `.env` nếu trống).
2. `customers`: `id`, `name`, `phone`, `email`, `status` (`'Tiềm năng'`, `'Đang chăm sóc'`, `'Đã chốt'`, `'Tạm dừng'`), `notes`, `created_at`.
3. `transactions`: `id`, `type` (`'THU'` | `'CHI'`), `amount` (số nguyên VNĐ), `category` (Bán hàng, Dịch vụ, Lương thưởng, Văn phòng, Marketing, Khác), `description`, `transaction_date` (`YYYY-MM-DD`), `payment_status` (`'Đã thanh toán'` | `'Công nợ'`), `customer_id` (FK tới `customers.id`, cho phép NULL), `created_at`.

### 4. Các chức năng bắt buộc
1. **Trang Đăng nhập (`/login`):** Thiết kế thẻ đăng nhập nằm giữa màn hình hiện đại, có bảo vệ session và rate-limit.
2. **Dashboard (`/`)**:
   - Bộ lọc Tháng/Năm ở góc trên bên phải.
   - 4 KPI Cards có icon riêng biệt: **Tổng Thu**, **Tổng Chi**, **Lợi nhuận ròng**, và **Công nợ tồn đọng**.
   - Biểu đồ cột (Chart.js) so sánh Thu - Chi 6 tháng gần nhất.
   - Bảng 5 giao dịch mới nhất kèm badge trạng thái đẹp mắt.
3. **Quản lý Khách hàng (`/customers`)**:
   - Thanh tìm kiếm nhanh + bộ lọc theo trạng thái dạng tab hoặc pills.
   - Bảng danh sách sạch sẽ, có avatar chữ cái đầu tên khách hàng tự động tạo màu.
   - Dùng **Flowbite Modal** để Thêm/Sửa khách hàng (không chuyển trang gây gián đoạn).
   - Drawer hoặc Modal **Chi tiết khách hàng**: Hiển thị tổng tiền đã thu, tổng nợ và lịch sử giao dịch của riêng khách đó.
4. **Quản lý Thu - Chi (`/transactions`)**:
   - Bộ lọc đa điều kiện (Loại Thu/Chi, Trạng thái thanh toán, Khoảng thời gian).
   - Dùng **Flowbite Modal** để Thêm/Sửa giao dịch (có ô chọn Khách hàng liên quan).
   - Nút bấm nhanh **"Đã thu/chi"** (1 click chuyển trạng thái từ `'Công nợ'` sang `'Đã thanh toán'` kèm hiệu ứng Toast SweetAlert2).
   - Nút **"Xuất Excel (CSV)"** chuẩn UTF-8 BOM không lỗi font tiếng Việt.

### 5. Quy tắc thực hiện
- Tổ chức code sạch sẽ (`src/db`, `src/routes`, `src/middleware`, `src/views/partials` tách riêng header, sidebar, footer để tái sử dụng).
- Viết đầy đủ 100% code cho tất cả các file, không dùng `// TODO` hay lược bỏ code.
- Kèm file `README.md` hướng dẫn chạy local và deploy Docker trên VPS.
