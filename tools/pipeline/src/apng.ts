/**
 * Dãy PNG → một file APNG. Không phụ thuộc gì ngoài `node:buffer`.
 *
 * ## Vì sao không dùng thư viện
 *
 * Kế hoạch M62 ghi `upng-js`. Đo lại thì nó **đắt hơn thứ nó thay**: `upng-js` mã hoá
 * từ buffer RGBA thô, nghĩa là mỗi khung phải giữ nguyên $w \times h \times 4$ byte
 * trong bộ nhớ rồi nén lại bằng deflate viết bằng JS — trong khi resvg **đã** trả về
 * PNG nén sẵn. Với clip 5 giây ở 25fps, bề rộng 720: $125$ khung $\times$ ~1,1 MB thô
 * = ~140 MB giữ trong RAM, và một lượt deflate JS cho mỗi khung.
 *
 * Còn APNG thì, theo đúng đặc tả, **là** một dãy PNG có chung `IHDR`: khung đầu giữ
 * nguyên `IDAT`, các khung sau đổi nhãn `IDAT` thành `fdAT` và thêm số thứ tự. Không
 * giải nén, không nén lại, không đọc một pixel nào. Đó là lý do file này ngắn hơn
 * phần chú thích của nó.
 *
 * Điều kiện để phép ghép ấy đúng: mọi khung phải cùng `IHDR` (cùng kích thước, cùng
 * độ sâu bit, cùng kiểu màu). Ta **kiểm** chứ không tin — resvg gọi với cùng
 * `width`/`height` thì luôn cùng, nhưng "luôn" ấy là một giả định về thư viện khác,
 * và giả định không kiểm là chỗ hỏng lặng lẽ (khung lệch kích thước cho ra một APNG
 * mở được mà nhoè bậy).
 *
 * `dispose_op = 0` (NONE) và `blend_op = 1` (SOURCE): mỗi khung là **cả hình**, ghi
 * đè khung trước. Đúng với thứ ta sinh ra — không có khung nào là bản vá cục bộ.
 */

/** Một khung: bytes PNG, và nó ở trên màn hình bao lâu. */
export interface ApngFrame {
  readonly png: Buffer;
  readonly delayMs: number;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Chunk {
  readonly type: string;
  readonly data: Buffer;
}

export function toApng(frames: readonly ApngFrame[]): Buffer {
  if (frames.length === 0) throw new Error('APNG cần ít nhất một khung.');

  const parsed = frames.map((f) => readChunks(f.png));
  const header = parsed[0]?.find((c) => c.type === 'IHDR');
  if (!header) throw new Error('Khung đầu không có IHDR — không phải PNG.');

  for (const [i, chunks] of parsed.entries()) {
    const ihdr = chunks.find((c) => c.type === 'IHDR');
    if (!ihdr || !ihdr.data.equals(header.data)) {
      throw new Error(
        `Khung ${i + 1} có IHDR khác khung đầu — không ghép được thành APNG. ` +
          'Mọi khung phải cùng kích thước và cùng kiểu màu.',
      );
    }
  }

  const width = header.data.readUInt32BE(0);
  const height = header.data.readUInt32BE(4);

  const parts: Buffer[] = [SIGNATURE, chunk('IHDR', header.data)];

  // Chunk phụ trợ của khung đầu (sRGB, gAMA, pHYs…) đi theo, đứng trước acTL. Bỏ
  // chúng thì màu có thể lệch so với chính các PNG rời ta vừa ghi ra cạnh nó.
  for (const c of parsed[0] ?? []) {
    if (c.type === 'IHDR' || c.type === 'IDAT' || c.type === 'IEND') continue;
    parts.push(chunk(c.type, c.data));
  }

  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0);
  actl.writeUInt32BE(0, 4); // 0 = lặp vô hạn
  parts.push(chunk('acTL', actl));

  let sequence = 0;
  for (const [i, chunks] of parsed.entries()) {
    const delayMs = frames[i]?.delayMs ?? 0;
    parts.push(chunk('fcTL', fctl(sequence, width, height, delayMs)));
    sequence += 1;

    for (const c of chunks) {
      if (c.type !== 'IDAT') continue;
      if (i === 0) {
        parts.push(chunk('IDAT', c.data));
      } else {
        const payload = Buffer.alloc(4 + c.data.length);
        payload.writeUInt32BE(sequence, 0);
        c.data.copy(payload, 4);
        sequence += 1;
        parts.push(chunk('fdAT', payload));
      }
    }
  }

  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/**
 * `delay_num/delay_den` là **hai số nguyên 16 bit**, không phải mili-giây.
 *
 * Mẫu số $1000$ cho thẳng mili-giây, và tử số vì thế trần ở $65535$ ms. Một mốc
 * `hold` dài hơn 65 giây thì kẹp lại chứ không tràn im lặng — tràn `uint16` cho ra
 * một khung chớp qua trong vài mili-giây, tức là **ngược hẳn** ý định của tác giả.
 */
function fctl(sequence: number, width: number, height: number, delayMs: number): Buffer {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(width, 4);
  data.writeUInt32BE(height, 8);
  data.writeUInt32BE(0, 12); // x_offset
  data.writeUInt32BE(0, 16); // y_offset
  data.writeUInt16BE(Math.min(65535, Math.max(0, Math.round(delayMs))), 20);
  data.writeUInt16BE(1000, 22);
  data.writeUInt8(0, 24); // dispose_op = NONE
  data.writeUInt8(1, 25); // blend_op = SOURCE
  return data;
}

export function readChunks(png: Buffer): Chunk[] {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Không phải dữ liệu PNG.');
  }
  const out: Chunk[] = [];
  let at = 8;
  while (at + 8 <= png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    out.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return out;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
