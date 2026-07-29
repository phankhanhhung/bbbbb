import type { Scene, SceneValidator } from '@combviz/schema';
import { buildPoints, collinearTriples, convexHull, crossings } from './geometry.js';

/**
 * `general-position` — không có ba điểm nào thẳng hàng.
 *
 * Ràng buộc trung tâm của gần như mọi bài hình học tổ hợp, và PT-01 nói thẳng
 * rằng nó phải ép được lúc đặt điểm. Ở đây nó là **luật chơi của sandbox**: kéo
 * một điểm vào đúng đường nối hai điểm khác thì đỏ ngay, và `violations` trả về
 * đúng ba điểm phạm chứ không phải cả tập.
 */
const generalPosition: SceneValidator = {
  id: 'general-position',
  label: 'Không có ba điểm thẳng hàng',
  check(scene: Scene) {
    const triples = collinearTriples(buildPoints(scene).points);
    if (triples.length === 0) return { ok: true, violations: [] };
    return {
      ok: false,
      violations: [...new Set(triples.flat())],
      message: `${triples.length} bộ ba thẳng hàng`,
    };
  },
};

/**
 * `convex-position` — **mọi** điểm đều là đỉnh của bao lồi.
 *
 * "Không điểm nào nằm trong bao" là cách phát biểu khác của cùng một điều, và là
 * giả thiết của cụm Erdős–Szekeres. Điểm nằm trên cạnh bao cũng bị tính là vi
 * phạm: nó không phải đỉnh, nên tập không ở vị trí lồi theo nghĩa bài toán dùng.
 */
const convexPosition: SceneValidator = {
  id: 'convex-position',
  label: 'Mọi điểm đều ở vị trí lồi',
  check(scene: Scene) {
    const points = buildPoints(scene).points;
    const onHull = new Set(convexHull(points).map((p) => p.id));
    const inside = points.filter((p) => !onHull.has(p.id));

    return inside.length === 0
      ? { ok: true, violations: [] }
      : {
          ok: false,
          violations: inside.map((p) => p.id),
          message: `${inside.length} điểm không phải đỉnh bao lồi`,
        };
  },
};

/** `no-crossings` — không đoạn nào cắt đoạn nào. */
const noCrossings: SceneValidator = {
  id: 'no-crossings',
  label: 'Không đoạn nào cắt nhau',
  check(scene: Scene) {
    const found = crossings(buildPoints(scene));
    return found.length === 0
      ? { ok: true, violations: [] }
      : {
          ok: false,
          violations: [...new Set(found.flatMap((c) => c.segments))],
          message: `${found.length} chỗ cắt nhau`,
        };
  },
};

const FIXED: readonly SceneValidator[] = [generalPosition, convexPosition, noCrossings];

export function resolvePointValidator(id: string): SceneValidator | null {
  const found = FIXED.find((v) => v.id === id);
  if (found) return found;

  // `hull-size:<k>` — bao lồi có đúng $k$ đỉnh. Dùng cho bài "tìm tứ giác lồi".
  const match = /^hull-size:(\d+)$/.exec(id);
  if (match) {
    const k = Number(match[1]);
    return {
      id,
      label: `Bao lồi có đúng ${k} đỉnh`,
      check(scene: Scene) {
        const hull = convexHull(buildPoints(scene).points);
        return hull.length === k
          ? { ok: true, violations: [] }
          : {
              ok: false,
              violations: hull.map((p) => p.id),
              message: `Bao lồi có ${hull.length} đỉnh, cần ${k}`,
            };
      },
    };
  }

  /**
   * `lattice` — mọi điểm nằm trên **nút lưới đã khai**, không phải "toạ độ nguyên".
   *
   * Hai thứ đó khác nhau, và khác đúng ở chỗ đau. Toạ độ scene là $10 \times$
   * toạ độ toán (quy ước G-10), nên một điểm ở scene $(5,5)$ có toạ độ nguyên
   * nhưng **không** là điểm nguyên của bài toán — nó nằm giữa hai nút lưới. Kiểm
   * `Number.isInteger` sẽ cho nó qua, và cả cụm lập luận chẵn lẻ sụp theo mà
   * hình vẫn trông bình thường.
   *
   * Lưới lấy từ `config.grid` — chính con số vẽ ra màn hình, nên thứ được kiểm
   * và thứ người đọc nhìn thấy không thể là hai thứ khác nhau.
   */
  if (id === 'lattice') {
    return {
      id,
      label: 'Mọi điểm nằm trên nút lưới',
      check(scene: Scene) {
        const step = (scene.config as { grid?: number })?.grid;
        if (!step || step <= 0) {
          return { ok: true, violations: [], message: 'Bỏ qua: scene không khai `grid`' };
        }
        const onGrid = (v: number): boolean =>
          Math.abs(v / step - Math.round(v / step)) < 1e-9;
        const bad = buildPoints(scene)
          .points.filter((p) => !onGrid(p.x) || !onGrid(p.y))
          .map((p) => p.id);
        return bad.length === 0
          ? { ok: true, violations: [] }
          : {
              ok: false,
              violations: bad,
              message: `${bad.length} điểm không nằm trên nút lưới`,
            };
      },
    };
  }

  return null;
}

export const POINT_VALIDATOR_IDS: readonly string[] = [
  ...FIXED.map((v) => v.id),
  'hull-size:<k>',
  'lattice',
];
