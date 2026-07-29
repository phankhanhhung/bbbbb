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
import { BOARD_VALIDATOR_IDS, resolveBoardValidator } from './validators.js';

export * from './schema.js';
export * from './geometry.js';
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

    for (let r = 0; r < config.rows; r += 1) {
      for (let c = 0; c < config.cols; c += 1) {
        ids.add(cellId(r, c));
      }
    }
    return ids;
  },

  checkBounds(scene: Scene, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const config = scene.config as BoardConfigType;
    if (!config || typeof config.rows !== 'number') return issues;

    const cells = config.rows * config.cols;
    if (cells > BOARD_LIMITS.maxCells) {
      issues.push({
        code: 'bounds/board-too-many-cells',
        severity: 'error',
        message: `Bàn ${config.rows}×${config.cols} = ${cells} ô, vượt trần ${BOARD_LIMITS.maxCells}`,
        path: `${path}/config`,
        hint: 'NFR-P4. Nới bound thì rẻ, nhưng phải đo lại NFR-P1 trên iPad trước',
      });
    }

    // Ô khuyết nằm ngoài bàn gần như luôn là lỗi gõ toạ độ, và nó im lặng:
    // bàn vẫn vẽ ra bình thường, chỉ có ô định khoét thì không mất.
    (config.holes ?? []).forEach(([r, c], i) => {
      if (r >= config.rows || c >= config.cols) {
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
      if (r >= config.rows || c >= config.cols) {
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

    return issues;
  },
};

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
      if (pos[0] >= config.rows || pos[1] >= config.cols) {
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
