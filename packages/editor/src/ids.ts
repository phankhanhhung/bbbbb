import type { Scene } from '@combviz/schema';

/**
 * Cấp id mới cho element (A-02).
 *
 * Command **không** tự sinh id — chúng phải replay được. Id được cấp ở phía UI
 * rồi truyền vào tham số lệnh, và đây là chính sách mặc định: lấy hậu tố số lớn
 * nhất đang có rồi cộng một.
 *
 * Giới hạn đã biết và chấp nhận **chỉ trong Sandbox**: xoá `t3` rồi thêm mới sẽ
 * lại ra `t3`. Trong sandbox không sao — không có anchor nào trỏ vào cấu hình
 * người học tự dựng. Trong Studio thì có: anchor trỏ tới id, và tái dùng id sẽ
 * làm anchor trỏ nhầm sang một element khác mà không có gì báo. Vì vậy Studio
 * (M6) dùng bộ đếm lưu trong file problem, không dùng hàm này.
 */
export function allocateId(scene: Scene, prefix: string): string {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

  let max = 0;
  for (const element of scene.elements) {
    const match = pattern.exec(element.id);
    if (match) max = Math.max(max, Number(match[1]));
  }

  return `${prefix}${max + 1}`;
}

/** Cấp nhiều id liên tiếp, không đụng nhau — dùng khi đặt một loạt element. */
export function allocateIds(scene: Scene, prefix: string, count: number): string[] {
  const first = Number(allocateId(scene, prefix).slice(prefix.length));
  return Array.from({ length: count }, (_, i) => `${prefix}${first + i}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
