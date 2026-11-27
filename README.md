# CRM Nội bộ

CRM quản lý khách hàng, sổ thu chi và tồn kho hàng hóa. Ứng dụng dùng Node.js,
Express và SQLite; dữ liệu được lưu bền vững trong `data/database.sqlite`.

## Chạy local

Yêu cầu Node.js 20 trở lên.

```bash
npm ci
cp .env.example .env
npm start
```

Trong `.env`, đặt `ADMIN_USER`, `ADMIN_PASS` (ít nhất 12 ký tự) và
`SESSION_SECRET` (ít nhất 32 ký tự). Có thể tạo secret bằng
`openssl rand -hex 32`. Mở `http://localhost:3000`.

## Tài khoản và duyệt phiếu

Đăng nhập bằng tài khoản quản trị, mở **Người dùng** trên thanh bên để tạo
Tài khoản **Quản lý**, **Kế toán** hoặc **Thủ quỹ** từ trang **Người dùng**.
Quản lý có quyền quản trị và là vai trò duy nhất được duyệt hoặc từ chối phiếu.
Kế toán được thêm/sửa khách hàng, quản lý kho và chỉnh sửa phiếu đang chờ duyệt;
thủ quỹ được tạo phiếu và xem dữ liệu. Admin quản lý người dùng và kho nhưng
không duyệt phiếu. Mỗi người dùng cũng có thể tự đổi họ tên, tên đăng nhập và
mật khẩu ở mục **Tài khoản của tôi**.

Mọi phiếu mới đều ở trạng thái **Chờ duyệt**. Người có quyền duyệt có thể duyệt
hoặc từ chối phiếu; từ chối phải có lý do. Chỉ phiếu đã duyệt mới được tính vào
tổng thu chi, công nợ và báo cáo. Người tạo được xem và sửa phiếu của mình; kế
toán cũng có thể sửa phiếu đang chờ, còn admin có thể sửa mọi phiếu. Mỗi lần
sửa, phiếu quay lại trạng thái chờ duyệt. Khi nâng cấp cơ sở dữ liệu hiện có,
các tài khoản cũ được giữ lại và giao dịch cũ được đánh dấu đã duyệt.

## Quản lý kho

Trang **Quản lý kho** cho phép tạo hàng hóa, cập nhật mã hàng, đơn vị tính,
giá vốn, giá bán và khuyến mại theo phần trăm hoặc số tiền trong khoảng ngày.
Danh sách hàng hóa và chứng từ nhập xuất được tách thành các tab riêng.
Danh mục và đơn vị tính được chọn từ danh sách có thể thêm tùy chọn mới; chỉ
xóa được lựa chọn chưa được hàng hóa sử dụng và hệ thống luôn giữ ít nhất một
lựa chọn mỗi loại. Danh mục và đơn vị tính đang có sẽ được giữ lại khi nâng
cấp dữ liệu hiện tại.
Quản trị viên, Quản lý và Kế toán lập phiếu nhập hoặc đơn bán nhiều mặt hàng.
Phiếu nhập tự tạo giao dịch chi; đơn bán áp dụng giá bán/khuyến mại và tự tạo
giao dịch thu. Cả hai giao dịch được liên kết với chứng từ kho và chờ Quản lý
duyệt. Tồn kho chỉ tăng/giảm khi phiếu được duyệt; đơn bán không thể vượt tồn
khả dụng. Giá vốn bình quân được cập nhật theo các phiếu nhập đã duyệt.

Các vai trò khác vẫn xem được danh mục, số lượng tồn, giá bán và khuyến mại,
nhưng không xem giá vốn, lãi gộp hay giá trị tồn kho. Giá trị các phiếu nhập
cũng được ẩn khỏi sổ thu chi, CSV và tổng quan của những vai trò này.

## Deploy VPS

Workflow GitHub Actions deploy mỗi khi push lên `main`. Dùng chung thư mục repo
hiện tại trên VPS: `/home/app/crm`. Trước lần deploy đầu, tạo hoặc cập nhật
`/home/app/crm/.env`, giữ nguyên các cấu hình cần thiết khác và đảm bảo có:

```env
ADMIN_USER=ten_dang_nhap_admin
ADMIN_PASS=mat_khau_rieng_toi_thieu_12_ky_tu
SESSION_SECRET=secret_ngau_nhien_toi_thieu_32_ky_tu
```

Giữ `.env` chỉ cho tài khoản deploy đọc (`chmod 600`). Không commit hoặc gửi
file này. Trong GitHub, tạo các Actions secrets `VPS_HOST`, `VPS_USER`,
`VPS_SSH_KEY`, `VPS_SSH_PORT` trong environment `deploy`.

Deploy dừng stack Twenty cũ nếu cấu hình Compose cũ còn tồn tại, sau đó thay
source trong `/home/app/crm`. Workflow giữ lại `.env`, `.git` và `data/`; không
xóa volume Docker. Nếu bản triển khai trước có
`/home/app/crm/internal-crm-finance/.env`, workflow chép các biến CRM còn thiếu
`ADMIN_PASS` và `SESSION_SECRET` từ file đó vào `.env` gốc trước khi dọn thư
mục app cũ. Nếu thiếu, workflow dùng username `admin` và tạo mật khẩu cùng
`SESSION_SECRET` ngẫu nhiên trong `.env` (không ghi các giá trị này ra log).
Nếu mật khẩu được tạo tự động, lấy nó qua SSH bằng
`grep '^ADMIN_PASS=' /home/app/crm/.env` và giữ riêng tư. App lắng nghe tại
`127.0.0.1:3002`, khớp Nginx
`crm.novatechhp.vn` với `proxy_pass http://127.0.0.1:3002`. Nginx HTTPS cần gửi
`X-Forwarded-Proto https`; cấu hình này cho phép session cookie bảo mật hoạt
động sau TLS termination.

Vì cookie đăng nhập chỉ được gửi qua HTTPS, nên chuyển hướng HTTP sang HTTPS
thay vì proxy HTTP tới app. Thay nội dung `location /` trong server port 80
bằng:

```nginx
return 301 https://$host$request_uri;
```

Sau khi cập nhật Nginx, kiểm tra cấu hình bằng `sudo nginx -t`, rồi reload bằng
`sudo systemctl reload nginx`.

## Kiểm tra

```bash
npm test
docker compose up -d --build
docker compose logs --tail=100 app
```
