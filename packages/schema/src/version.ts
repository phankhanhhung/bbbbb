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
 * **`1.1.0` — minor đầu tiên sau freeze (M74)**: board có thêm element `path`
 * (BD-11). Thêm một *biến thể* vào union element là thêm khả năng, không đổi
 * lời hứa nào — nên minor, và nên một migration đồng nhất theo đúng luật đã
 * khai ngay dưới đây. Đây cũng là lần đầu cửa sổ đọc **trượt**: `1.0.0` từ vị
 * trí "hiện tại" xuống "n−1", vẫn đọc được; `0.3.0` thì từ đây nằm ngoài cửa
 * sổ vĩnh viễn, và validate nói ra điều đó thay vì để Player đoán.
 *
 * **`1.2.0` — khối `step.play` (GM-01/02, M78)**: step khai được rằng nó **chơi
 * được**. Cùng luật với `1.1.0` — thêm một trường optional trên `Step`, không đổi
 * lời hứa nào, nên minor và migration đồng nhất. Cửa sổ đọc trượt tiếp: `1.1.0`
 * xuống n−1, `1.0.0` ra khỏi cửa sổ.
 *
 * **`1.3.0` — `play.script` (DSL-03, M78.6)**: tác giả khai được luật chơi của riêng
 * mình bằng phép duyệt `moves { … }`, không phải đợi ai sửa mã engine. Vẫn là một
 * trường optional, nên vẫn minor và vẫn migration đồng nhất. Cửa sổ đọc trượt tiếp:
 * `1.2.0` xuống n−1, `1.1.0` ra khỏi cửa sổ.
 *
 * **`1.4.0` — `graph.config.token` và `graph.config.ground` (GM-01, M78.4)**: quân đang
 * đứng ở đâu (trạng thái của ván geography) và mặt đất của Hackenbush. Vẫn là trường
 * optional, nên vẫn minor và vẫn migration đồng nhất — nhưng vẫn **phải** đổi dấu, vì
 * `GraphConfig` cũng khai `additionalProperties: false`: một bài mang `token` mà đóng
 * dấu `1.3.0` sẽ bị chính bộ đọc `1.3.0` từ chối. Cửa sổ đọc trượt tiếp: `1.3.0` xuống
 * n−1, `1.2.0` ra khỏi cửa sổ.
 *
 * **`1.5.0` — `vertex.value` (GR-14)**: đỉnh đồ thị mang được **số**, đối xứng với
 * `weight` vốn có của cạnh. Sinh ra từ một nợ có tên: cả họ bài "đặt số lên đỉnh rồi
 * thao tác" — IMO 1986 bài 3 là ca điển hình — không khai được đại lượng bất biến hay
 * đơn điệu nào, vì `label` là **chuỗi** và không binding nào đọc ra số từ nó. Vẫn là
 * trường optional trên một element, nên vẫn minor và vẫn migration đồng nhất; con dấu
 * vẫn phải đổi vì element schema cũng đóng `additionalProperties`. Cửa sổ đọc trượt
 * tiếp: `1.4.0` xuống n−1, `1.3.0` ra khỏi cửa sổ.
 *
 * **`1.6.0` — `algebra.config.assume` (AL-22)**: giả thiết về một ký hiệu hàm —
 * *"$f$ đơn ánh"* — khai cạnh phương trình hàm. Sinh ra từ nợ có tên của
 * `ALGEBRA-COVERAGE.md` §4.2: engine giữ được chuỗi thế mà chưa giữ được điều rút ra
 * từ chuỗi thế, nên mạch phương trình hàm không kết được. Khai ở **scene** chứ không
 * ở từng bước, và đó chính là lý do phải bump: bước khai lấy bước dùng thì không ai
 * đối chiếu được, còn khai một lần ở config thì `readAlgebra` từ chối mọi lượt dùng
 * chưa được khai. Vẫn là trường optional trong config của một engine, nên vẫn minor và
 * vẫn migration đồng nhất; con dấu vẫn phải đổi vì `AlgebraConfig` cũng khai
 * `additionalProperties: false`. Cửa sổ đọc trượt tiếp: `1.5.0` xuống n−1, `1.4.0` ra
 * khỏi cửa sổ.
 *
 * Từ đây: thêm trường optional = minor + migration đồng nhất; đổi/gỡ = major.
 * Cửa sổ đọc của Player là minor hiện tại và n−1 (`isReadableVersion`), và
 * validate đứng gác ở cửa (`version/unreadable`).
 */
export const SCHEMA_VERSION = '1.6.0';
