import type {
  EngineSchemaFragment,
  Scene,
  ValidationIssue,
} from '@combviz/schema';
import {
  BOARD_LIMITS,
  BoardConfig,
  PieceElement,
  RegionElement,
  TileElement,
  type BoardConfig as BoardConfigType,
} from './schema.js';
import { cellId } from './ids.js';
import { latticeOf } from './geometry.js';
import {
  cellCount,
  cellsInRow,
  directionCount,
  inBoard,
  isLatticeShape,
  LATTICE_SHAPES,
  type LatticeShape,
} from './lattice.js';
import { BOARD_VALIDATOR_IDS, resolveBoardValidator } from './validators.js';

export * from './schema.js';
export { boardTools } from './tools.js';
export * from './geometry.js';
export * from './lattice.js';
export * from './ids.js';
export { boardRenderer } from './render.js';
export * from './dsl.js';
export * from './validators.js';
export * from './commands.js';
export * from './hit-test.js';

export function isHole(config: BoardConfigType, row: number, col: number): boolean {
  return (config.holes ?? []).some(([r, c]) => r === row && c === col);
}

/**
 * Số ô mà một tile phủ — cần cho bound `maxTiles` và cho `covered()` ở M2.
 */
const TILE_CELL_COUNT: Readonly<Record<string, number>> = {
  domino: 2,
  'tromino-i': 3,
  'tromino-l': 3,
  'tetromino-i': 4,
  'tetromino-o': 4,
  'tetromino-t': 4,
  'tetromino-s': 4,
  'tetromino-l': 4,
};

export const boardSchemaFragment: EngineSchemaFragment = {
  id: 'board',
  configSchema: BoardConfig,
  elementSchemas: {
    piece: PieceElement,
    tile: TileElement,
    region: RegionElement,
  },
  bounds: { engine: 'board', limits: BOARD_LIMITS },
  resolveValidator: resolveBoardValidator,
  validatorIds: BOARD_VALIDATOR_IDS,

  /**
   * Ô khuyết **vẫn nằm trong** tập này.
   *
   * Ô khuyết là một thứ được vẽ ra và được nói tới — bài mẫu mở đầu bằng đúng câu
   * "bàn cờ khuyết hai ô góc đối nhau", anchor trỏ thẳng vào hai ô đó. "Khuyết"
   * là một thuộc tính của ô, không phải sự vắng mặt của nó; loại chúng khỏi đây
   * sẽ khiến ANC-02 báo anchor rot cho một anchor hoàn toàn đúng.
   */
  implicitElementIds(scene: Scene): Set<string> {
    const config = scene.config as BoardConfigType;
    const ids = new Set<string>();
    if (!config || typeof config.rows !== 'number') return ids;

    const lattice = latticeOf(config);
    for (let r = 0; r < config.rows; r += 1) {
      for (let c = 0; c < cellsInRow(lattice, config.cols, r); c += 1) {
        ids.add(cellId(r, c));
      }
    }
    return ids;
  },

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = scene.config as BoardConfigType;
    if (!config || typeof config.rows !== 'number') return issues;

    const lattice = latticeOf(config);
    const cells = cellCount(lattice, config.rows, config.cols);
    if (cells > BOARD_LIMITS.maxCells) {
      issues.push({
        code: 'bounds/board-too-many-cells',
        severity: 'error',
        message: `Bàn ${config.rows}×${config.cols} = ${cells} ô, vượt trần ${BOARD_LIMITS.maxCells}`,
        path: `${path}/config`,
        hint: 'NFR-P4. Nới bound thì rẻ, nhưng phải đo lại NFR-P1 trên iPad trước',
      });
    }

    issues.push(...checkLattice(scene, config, path));

    // Ô khuyết nằm ngoài bàn gần như luôn là lỗi gõ toạ độ, và nó im lặng:
    // bàn vẫn vẽ ra bình thường, chỉ có ô định khoét thì không mất.
    (config.holes ?? []).forEach(([r, c], i) => {
      if (!inBoard(lattice, config.rows, config.cols, r, c)) {
        issues.push({
          code: 'bounds/hole-out-of-board',
          severity: 'error',
          message: `Ô khuyết (${r}, ${c}) nằm ngoài bàn ${config.rows}×${config.cols}`,
          path: `${path}/config/holes/${i}`,
        });
      }
    });

    Object.keys(config.cell_overrides ?? {}).forEach((key) => {
      const match = /^cell-(\d+)-(\d+)$/.exec(key);
      if (!match) return;
      const r = Number(match[1]);
      const c = Number(match[2]);
      if (!inBoard(lattice, config.rows, config.cols, r, c)) {
        issues.push({
          code: 'bounds/cell-override-out-of-board',
          severity: 'error',
          message: `cell_overrides trỏ tới "${key}" nằm ngoài bàn`,
          path: `${path}/config/cell_overrides/${key}`,
        });
      } else if (isHole(config, r, c)) {
        issues.push({
          code: 'bounds/cell-override-on-hole',
          severity: 'warning',
          message: `cell_overrides tô ô khuyết "${key}" — sẽ không hiện`,
          path: `${path}/config/cell_overrides/${key}`,
        });
      }
    });

    const tiles = scene.elements.filter((e) => e.type === 'tile');
    if (tiles.length > BOARD_LIMITS.maxTiles) {
      issues.push({
        code: 'bounds/too-many-tiles',
        severity: 'error',
        message: `${tiles.length} tile, vượt trần ${BOARD_LIMITS.maxTiles}`,
        path: `${path}/elements`,
      });
    }

    const pieces = scene.elements.filter((e) => e.type === 'piece');
    if (pieces.length > BOARD_LIMITS.maxPieces) {
      issues.push({
        code: 'bounds/too-many-pieces',
        severity: 'error',
        message: `${pieces.length} quân, vượt trần ${BOARD_LIMITS.maxPieces}`,
        path: `${path}/elements`,
      });
    }

    const regions = scene.elements.filter((e) => e.type === 'region');
    if (regions.length > BOARD_LIMITS.maxRegions) {
      issues.push({
        code: 'bounds/too-many-regions',
        severity: 'error',
        message: `${regions.length} region, vượt trần ${BOARD_LIMITS.maxRegions}`,
        path: `${path}/elements`,
      });
    }

    issues.push(...checkTilePlacement(scene, config, path));
    issues.push(...checkTilePose(scene, config, path));

    return issues;
  },
};

/**
 * Tư thế của quân phải khớp **họ hình** của nó (BD-09).
 *
 * Hai họ mang tư thế bằng hai trường, và một quân mang nhầm trường là một quân
 * không có tư thế xác định — nhưng nó **vẫn vẽ ra được**, ở tư thế mặc định, nên
 * lỗi này thuộc loại chỉ lộ ra khi tác giả nhìn hình và thấy quân nằm sai chỗ. Bắt
 * lúc soạn thì rẻ hơn nhiều.
 *
 * Cả hai chiều đều chặn, và chặn cả `flip`: hình thoi đối xứng tâm nên lật nó ra
 * chính nó, và một trường không đổi gì là một trường nói dối.
 */
function checkTilePose(
  scene: Scene,
  config: BoardConfigType,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lattice = latticeOf(config);

  scene.elements.forEach((item, i) => {
    if (item.type !== 'tile') return;
    const shape = String(item['shape']);
    const where = `${path}/elements/${i}`;

    if (!isLatticeShape(shape)) {
      if (item['dir'] !== undefined) {
        issues.push({
          code: 'bounds/dir-on-polyomino',
          severity: 'error',
          message: `Quân \`${shape}\` là polyomino nên dùng \`rot\`, không dùng \`dir\``,
          path: where,
          hint: '`dir` là chỉ số hướng của lưới phi vuông; polyomino quay theo độ',
        });
      }
      return;
    }

    const spec = LATTICE_SHAPES[shape] as LatticeShape;
    if (spec.lattice !== lattice) {
      issues.push({
        code: 'bounds/shape-wrong-lattice',
        severity: 'error',
        message: `Quân \`${shape}\` chỉ đặt được trên lưới \`${spec.lattice}\`, bàn đang là \`${lattice}\``,
        path: where,
        hint: 'Hình được khai bằng đường đi trên đồ thị kề của một lưới cụ thể',
      });
    }

    if (item['rot'] !== undefined) {
      issues.push({
        code: 'bounds/rot-on-lattice-shape',
        severity: 'error',
        message: `Quân \`${shape}\` dùng \`dir\`, không dùng \`rot\``,
        path: where,
        hint: 'Phép quay 90° không phải phép đối xứng của lưới tam giác hay lục giác',
      });
    }

    if (item['flip'] === true) {
      issues.push({
        code: 'bounds/flip-on-lattice-shape',
        severity: 'error',
        message: `Quân \`${shape}\` không lật được`,
        path: where,
        hint: 'Hình thoi đối xứng tâm: lật nó ra chính nó',
      });
    }

    const n = directionCount(lattice);
    const dir = Number(item['dir'] ?? 0);
    if (dir >= n) {
      issues.push({
        code: 'bounds/dir-out-of-range',
        severity: 'error',
        message: `\`dir\` = ${dir} nhưng lưới \`${lattice}\` chỉ có ${n} hướng`,
        path: where,
        hint: 'Chỉ số hướng đếm từ 0',
      });
    }
  });

  return issues;
}

/**
 * Luật riêng của lưới phi vuông (BD-07).
 *
 * Ba tính năng của board **chỉ có nghĩa trên lưới vuông**, và cả ba đều là thứ
 * hỏng lặng lẽ chứ không nổ: polyomino là hình ghép từ ô **vuông**; bảng PRN-03
 * là hàng và cột thẳng; luật đi quân cờ nói về hàng, cột, đường chéo của bàn cờ
 * vuông. Không chặn thì hình vẫn vẽ ra, chỉ là quân domino nằm chéo trên bàn ong
 * và không ai nhận ra đó là lỗi của engine chứ không phải của bài.
 */
function checkLattice(
  scene: Scene,
  config: BoardConfigType,
  path: string,
): ValidationIssue[] {
  const lattice = latticeOf(config);
  if (lattice === 'square') return [];

  const issues: ValidationIssue[] = [];
  const refuse = (code: string, message: string, where: string, hint: string): void => {
    issues.push({ code, severity: 'error', message, path: `${path}/${where}`, hint });
  };

  if (lattice === 'triangle' && config.cols !== config.rows) {
    refuse(
      'bounds/triangle-cols-mismatch',
      `Lưới tam giác cạnh ${config.rows} phải khai \`cols\` = ${config.rows}, đang là ${config.cols}`,
      'config/cols',
      'Tam giác cạnh n có n² ô, nên rows × cols đếm đúng số ô khi cols = rows',
    );
  }

  if (lattice === 'hex' && config.coloring_preset?.type === 'checkerboard') {
    refuse(
      'bounds/checkerboard-on-hex',
      'Lưới lục giác không tô được **hai** màu',
      'config/coloring_preset',
      'Ba ô kề nhau đôi một trên bàn ong tạo thành tam giác, nên đồ thị kề của nó có chu trình lẻ',
    );
  }

  if (config.table) {
    refuse(
      'bounds/table-needs-square',
      'Bảng (`table`) chỉ dùng được với lưới vuông',
      'config/table',
      'Nhãn hàng/cột và dòng tổng giả định hàng và cột thẳng',
    );
  }

  if (
    scene.elements.some((e) => e.type === 'tile' && !isLatticeShape(String(e['shape'])))
  ) {
    refuse(
      'bounds/tile-needs-square',
      'Quân polyomino chỉ đặt được trên lưới vuông',
      'elements',
      'Polyomino là hình ghép từ ô vuông; lưới phi vuông dùng họ hình riêng (BD-09) — xem `LATTICE_SHAPES`',
    );
  }

  if (scene.elements.some((e) => e.type === 'piece' && e['show_attacks'] === true)) {
    refuse(
      'bounds/attacks-need-square',
      '`show_attacks` chỉ dùng được với lưới vuông',
      'elements',
      'Luật đi quân cờ phát biểu trên hàng, cột và đường chéo của bàn cờ vuông',
    );
  }

  return issues;
}

/**
 * Tile `custom` phải khai `offsets`, và tile có sẵn thì không được khai.
 *
 * Không phải bound, nhưng cùng họ: đây là loại sai mà JSON Schema không bắt được
 * (union hợp lệ về hình dạng) và người soạn chỉ phát hiện khi mở Player thấy
 * hình trống.
 */
function checkTilePlacement(
  scene: Scene,
  config: BoardConfigType,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  scene.elements.forEach((element, i) => {
    if (element.type !== 'tile') return;
    const shape = element['shape'];
    const offsets = element['offsets'];

    if (shape === 'custom' && !Array.isArray(offsets)) {
      issues.push({
        code: 'board/custom-tile-missing-offsets',
        severity: 'error',
        message: `Tile "${element.id}" là custom nhưng không khai offsets`,
        path: `${path}/elements/${i}`,
      });
    }
    if (shape !== 'custom' && offsets !== undefined) {
      issues.push({
        code: 'board/offsets-on-preset-tile',
        severity: 'warning',
        message: `Tile "${element.id}" dùng shape "${String(shape)}" nên offsets bị bỏ qua`,
        path: `${path}/elements/${i}/offsets`,
      });
    }

    const pos = element['pos'];
    if (Array.isArray(pos) && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
      if (!inBoard(latticeOf(config), config.rows, config.cols, pos[0], pos[1])) {
        issues.push({
          code: 'board/tile-out-of-board',
          severity: 'error',
          message: `Tile "${element.id}" đặt ở (${pos[0]}, ${pos[1]}), ngoài bàn`,
          path: `${path}/elements/${i}/pos`,
        });
      }
    }
  });

  return issues;
}

export { TILE_CELL_COUNT };
