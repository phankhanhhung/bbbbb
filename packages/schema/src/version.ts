/**
 * Phiên bản schema hiện tại.
 *
 * **Vẫn ở `0.x` và đó là chủ đích.** Gate G-C của kế hoạch buộc freeze lên
 * `1.0.0` *sau* khi 5 bài đầu được soạn tay — vì chỉ khi soạn thật mới lộ ra
 * schema thiếu gì. Kho hiện có 2 bài và chưa bài nào do chính chủ soạn tay, nên
 * freeze bây giờ là hứa tương thích cho một hợp đồng chưa được thử.
 *
 * Bộ máy migrate (DAT-02) thì đã sẵn sàng — nó cần tồn tại trước lúc freeze, chứ
 * không phải sau.
 */
export const SCHEMA_VERSION = '0.1.0';
