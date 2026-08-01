/**
 * Phiên bản schema hiện tại.
 *
 * **`1.0.0` — G-C đã đóng, 2026-08-01, theo chỉ định của chính chủ.** Điều kiện
 * gốc của gate ("soạn tay 3–5 bài rồi mới freeze") được thay bằng một điều kiện
 * mạnh hơn về cùng một rủi ro: chuẩn nội dung **kết tinh từ 114 bài đã xuất
 * bản** (Style Guide v1.0 đo trên corpus, không phải viết trước), cộng một lượt
 * rà toàn hệ ngay trước freeze — mọi lỗ schema tìm được (Record khoá-pattern hở,
 * `from` không kiểm, trường chết `widget_state`/`assets`) đã vá *trước* khi con
 * dấu này đổi, vì sau nó mỗi thay đổi tốn một migration.
 *
 * Lịch sử 0.x, giữ làm bằng chứng: `0.2.0` thêm `Step.choreography` (lần đầu bộ
 * máy migrate thật sự chạy); `0.3.0` thêm `cell_overrides[...].strike` (BD-10).
 *
 * Từ đây: thêm trường optional = minor + migration đồng nhất; đổi/gỡ = major.
 * Cửa sổ đọc của Player là minor hiện tại và n−1 (`isReadableVersion`), và
 * validate đứng gác ở cửa (`version/unreadable`).
 */
export const SCHEMA_VERSION = '1.0.0';
