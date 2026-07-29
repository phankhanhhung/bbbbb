/**
 * Cây cú pháp của Expression DSL (DSL-01).
 *
 * Ngôn ngữ **thuần**: không gán, không vòng lặp tự do, không định nghĩa hàm.
 * Lặp chỉ tồn tại bên trong `count/sum/min/max/forall/exists`, và lambda chỉ
 * xuất hiện làm tham số của chúng — không phải giá trị hạng nhất.
 *
 * Đây là đối sách của R-2 (DSL phình thành ngôn ngữ lập trình) viết thành kiểu
 * dữ liệu: thêm một dạng node mới là một quyết định nhìn thấy được, không phải
 * một tiện ích lỡ tay thêm vào.
 */

export type Expr =
  | { kind: 'number'; value: number; pos: number }
  | { kind: 'boolean'; value: boolean; pos: number }
  | { kind: 'string'; value: string; pos: number }
  | { kind: 'ident'; name: string; pos: number }
  | { kind: 'member'; object: Expr; property: string; pos: number }
  | { kind: 'unary'; op: UnaryOp; argument: Expr; pos: number }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; pos: number }
  /** Callee luôn là một tên có sẵn: không có hàm hạng nhất, không có gọi động. */
  | { kind: 'call'; callee: string; args: Expr[]; pos: number }
  | { kind: 'lambda'; param: string; body: Expr; pos: number };

export type UnaryOp = '-' | '!';

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||';

export class DslError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
    this.name = 'DslError';
  }
}
