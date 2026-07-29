import type { Expr } from './ast.js';

/**
 * Giá trị trong DSL.
 *
 * Cố ý **không có null/undefined**: engine chuẩn hoá element sao cho mọi thuộc
 * tính khai báo đều có giá trị (ô không được tô có `color_class == 0`). Nhờ vậy
 * `c.color_class == 1` luôn trả về true/false thay vì lan một giá trị rỗng qua
 * cả biểu thức rồi lỗi ở chỗ không liên quan.
 */
export type Value =
  | number
  | boolean
  /**
   * Chuỗi chỉ để **so sánh**, không nối, không cắt.
   *
   * Cần vì element mang thuộc tính phân loại (`p.kind`, `t.shape`), và không có
   * chuỗi thì phải bịa ra một builtin boolean cho từng loại quân — vừa cồng kềnh
   * vừa phải sửa DSL mỗi lần engine thêm một loại. Grammar vẫn đóng: chuỗi là dữ
   * liệu trơ, không có phép toán nào sinh ra chuỗi mới.
   */
  | string
  | ElementValue
  | readonly Value[]
  | LambdaValue;

export interface ElementValue {
  readonly kind: 'element';
  readonly id: string;
  readonly props: Readonly<Record<string, number | boolean | string>>;
}

export interface LambdaValue {
  readonly kind: 'lambda';
  readonly param: string;
  readonly body: Expr;
}

export function isElement(value: Value): value is ElementValue {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'element';
}

export function isLambda(value: Value): value is LambdaValue {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'lambda';
}

export function isList(value: Value): value is readonly Value[] {
  return Array.isArray(value);
}

/** Tên loại dùng trong thông báo lỗi — tiếng Việt, không phải tên kiểu TS. */
export function typeName(value: Value): string {
  if (typeof value === 'number') return 'số';
  if (typeof value === 'boolean') return 'giá trị đúng/sai';
  if (typeof value === 'string') return 'chuỗi';
  if (isElement(value)) return 'element';
  if (isLambda(value)) return 'hàm';
  if (isList(value)) return 'tập hợp';
  return 'giá trị lạ';
}

export function element(
  id: string,
  props: Readonly<Record<string, number | boolean | string>>,
): ElementValue {
  return { kind: 'element', id, props };
}
