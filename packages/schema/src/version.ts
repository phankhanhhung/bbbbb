/**
 * Phiên bản schema hiện tại.
 *
 * **Vẫn ở `0.x` và đó là chủ đích.** Gate G-C của kế hoạch buộc freeze lên
 * `1.0.0` *sau* khi 5 bài đầu được soạn tay — vì chỉ khi soạn thật mới lộ ra
 * schema thiếu gì. Chưa bài nào do chính chủ soạn tay, nên freeze bây giờ là hứa
 * tương thích cho một hợp đồng chưa được thử.
 *
 * `0.2.0` thêm `Step.choreography` (CHO-01..10) — trường **optional**, không bài
 * cũ nào phải sửa gì, nên đúng nghĩa một minor bump. Nó cũng là lần đầu bộ máy
 * migrate (DAT-02) thật sự chạy: trước đó `MIGRATIONS` rỗng, và một cơ chế chưa
 * bao giờ chạy thì chưa phải một cơ chế.
 */
export const SCHEMA_VERSION = '0.2.0';
