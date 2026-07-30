/**
 * Ước bề ngang một dòng chữ, tính bằng đơn vị scene.
 *
 * **Vì sao cần ước.** Renderer thuần (D-03) không có DOM nên không đo được chữ:
 * `getComputedTextLength` chỉ tồn tại trong browser, còn CLI thì render trong
 * Node. Nhưng viewport phải rộng đủ chứa chữ **trước** khi chữ được vẽ, nên chỗ
 * này buộc phải đoán.
 *
 * **Vì sao nó là một hàm dùng chung, không phải một hằng số trong từng engine.**
 * Bốn engine có `caption` — game, set, sequence, point — và cả bốn đều chừa chỗ
 * **theo chiều cao** rồi quên chiều ngang, nên caption dài hơn hình thì bị cắt
 * cụt ở mép khung: chữ vẫn được vẽ, `viewBox` vẫn hợp lệ, không lỗi nào nổi lên,
 * chỉ là người đọc thấy "Bốc một đống, hoặ". `derivation` thì tự ước riêng cho
 * ghi chú bằng một hệ số của nó. Năm chỗ đoán cùng một chuyện là năm chỗ lệch —
 * đúng lớp lỗi mà M19/M20/M21 đã gặp ba lần.
 *
 * **Hệ số $0{,}55$ em ở đâu ra.** Đo trên phông giao diện thật (Inter) bằng cách
 * render caption ra PNG rồi so bề ngang: một dòng $17$ ký tự tiếng Việt chiếm
 * $0{,}49$ em mỗi ký tự. Lấy $0{,}55$ để **ước dôi**, và hướng sai đó là hướng
 * đúng: ước dôi thì thừa một dải lề trắng, ước thiếu thì chữ mất đuôi. Dấu phụ
 * tiếng Việt không cộng thêm bề ngang nên không phải trừ riêng.
 */
const EM_PER_CHAR = 0.55;

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * EM_PER_CHAR;
}
