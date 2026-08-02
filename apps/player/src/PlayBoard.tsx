import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  createPlay,
  playMove,
  resetPlay,
  toDraftSteps,
  undoMove,
  type Move,
  type PlayPlayer,
  type PlayRules,
  type PlaySession,
} from '@combviz/editor';
import { createContext, createRenderer, type LabelAtlas } from '@combviz/render';
import { patch } from '@combviz/render/dom';
import { defaultTheme } from '@combviz/theme';
import type { PlayBlock, Scene } from '@combviz/schema';
import type { LoadedEngine } from './engines.js';
import { useSolve } from './usePlay.js';

/**
 * **Bàn chơi** — GM-02/03/04 hiện ra thành một thứ bấm được (M78.7).
 *
 * Sáu lượt vừa rồi dựng đủ bộ máy để chơi một ván và không ai chơi được ván nào: hợp
 * đồng nước đi (.1), ba substrate (.2/.3/.4), solver (.5), Worker (.6). Đây là chỗ chúng
 * gặp người học.
 *
 * ## Vì sao **không** nhét vào `Sandbox`
 *
 * Sandbox là chế độ *sửa tự do*: mọi lệnh của engine đều bấm được, undo là undo lệnh,
 * và không có khái niệm lượt. Ván chơi thì ngược lại ở cả ba: chỉ nước hợp lệ mới bấm
 * được, undo là **lùi một nước** (tức là lùi *hai* trạng thái nếu tính cả lượt), và
 * "đến lượt ai" là câu hỏi trung tâm. Trộn hai chế độ vào một component nghĩa là mỗi
 * nhánh trong bảy trăm dòng của Sandbox mọc thêm một điều kiện `đang chơi?`, và chế độ
 * nào cũng đọc như một ngoại lệ của chế độ kia.
 *
 * Chúng dùng chung thứ đáng dùng chung — renderer, `hitTest`, viewport, `patch` — và
 * chỗ ấy là các gói, không phải một component.
 *
 * ## Chọn nước **trên hình**, không phải trong danh sách
 *
 * Danh sách nước vẫn có (bàn phím, đọc màn hình, và những nước không neo vào phần tử
 * nào), nhưng đường chính là chạm vào hình: `Move.targets` trả lời đúng câu *"chạm đâu
 * thì được nước này"*, và `engine.hitTest` đã trả lời câu *"chạm đây là chạm vào cái
 * gì"* từ P1. Nối hai câu ấy là xong — không cần một lớp toạ độ thứ hai.
 */

interface PlayBoardProps {
  readonly scene: Scene;
  readonly engine: LoadedEngine;
  readonly play: PlayBlock;
  readonly labels?: LabelAtlas | null;
  readonly onClose?: () => void;
}

/** Tên hiển thị của một bên. Họ luật được quyền nói rõ hơn — xem `PlayRules.sideName`. */
function nameOf(rules: PlayRules, player: PlayPlayer): string {
  const base = player === 'left' ? 'Người 1' : 'Người 2';
  const extra = rules.sideName?.(player);
  return extra === undefined ? base : `${base} — ${extra}`;
}

export function PlayBoard({ scene, engine, play, labels, onClose }: PlayBoardProps) {
  const rules = useMemo(
    () => engine.playRules?.(play.rule) ?? null,
    [engine, play.rule],
  );

  const [session, setSession] = useState<PlaySession | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** Nước đang rê chuột lên — dùng để **soi trước** nó chạm vào những gì. */
  const [hovered, setHovered] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  // Ván dựng lại từ đầu khi đổi thế hoặc đổi luật. Không phụ thuộc `session` để tránh
  // vòng: effect này **đặt** nó.
  useEffect(() => {
    if (!rules) {
      setSession(null);
      return;
    }
    setSession(
      createPlay(scene, rules, {
        first: play.first ?? 'left',
        misere: play.misere === true,
      }),
    );
    setRefusal(null);
    setAsked(false);
  }, [scene, rules, play.first, play.misere]);

  const renderer = useMemo(() => createRenderer([engine.renderer]), [engine]);

  /**
   * Phần tử **sáng lên**: đích của đúng nước đang được nhắm, và không gì khác.
   *
   * Bản đầu sáng *mọi* nước hợp lệ khi chưa nhắm gì. Nhìn ra thì cả bàn Chomp $3\times3$
   * hoá một khối vàng — chín ô cùng sáng nghĩa là "sáng" không phân biệt được gì, và nó
   * còn che mất màu của chính nội dung (ô sô-cô-la và ô độc khác nhau ở màu). Trớ trêu
   * là chú thích cũ đã viết ra đúng lý lẽ ấy rồi vẫn để nguyên hành vi.
   *
   * "Đang nhắm" có hai đường và cả hai đổ về một chỗ: rê chuột trên **hình** (ô dưới con
   * trỏ), hoặc rê/tab vào một dòng trong **bảng nước đi**. Mặc định không sáng gì, và
   * bàn cờ trông đúng như nó vốn có.
   */
  const highlight = useMemo(() => {
    if (!session || hovered === null) return new Set<string>();
    return new Set(session.moves.filter((m) => m.id === hovered).flatMap((m) => m.targets));
  }, [session, hovered]);

  const ctx = useMemo(
    () => createContext(defaultTheme, { highlight, ...(labels ? { labels } : {}) }),
    [highlight, labels],
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const viewport = useMemo(
    () => (session ? renderer.viewportOf(session.scene, ctx) : null),
    [renderer, session, ctx],
  );

  useEffect(() => {
    const container = svgRef.current;
    if (!container || !session) return;
    // Không animate: nước đi là thao tác của chính người chơi, và một hình trượt 360ms
    // biến "tôi vừa ăn ô này" thành "có gì đó đang xảy ra".
    patch(container, renderer.render(session.scene, ctx));
  }, [renderer, session, ctx]);

  const run = useCallback(
    (id: string) => {
      if (!session || !rules) return;
      const out = playMove(session, id, rules, engine.commands);
      setRefusal(out.refusal);
      setHovered(null);
      if (out.refusal === null) {
        setSession(out.session);
        setAsked(false);
      }
    },
    [session, rules, engine.commands],
  );

  /**
   * Con trỏ đang ở trên **nước nào**.
   *
   * Chạm trúng nhiều nước là chuyện xảy ra được (một cạnh Hackenbush nằm dưới nhãn của
   * nó chẳng hạn), và ở đó chọn bừa là sai. Lấy nước đầu tiên theo thứ tự
   * `session.moves` — tức là theo thứ tự bảng bên phải — nên thứ xảy ra luôn khớp với
   * dòng trên cùng mà mắt đang thấy.
   */
  const moveAt = useCallback(
    (event: PointerEvent): Move | undefined => {
      const svg = svgRef.current;
      if (!svg || !session || !viewport) return undefined;
      const rect = svg.getBoundingClientRect();
      const hits = new Set(
        engine.hitTest(session.scene, {
          x: viewport.x + ((event.clientX - rect.left) / rect.width) * viewport.width,
          y: viewport.y + ((event.clientY - rect.top) / rect.height) * viewport.height,
        }),
      );
      return session.moves.find((m) => m.targets.some((t) => hits.has(t)));
    },
    [engine, session, viewport],
  );

  const solved = useSolve(
    asked && session && !session.over ? session.scene : undefined,
    play.rule,
    session?.toMove ?? 'left',
    play.misere === true,
    play.solver_bound,
  );

  const draft = useCallback(() => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(toDraftSteps(session), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'combviz-van-choi.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [session]);

  if (!rules || !session || !viewport) {
    return (
      <section class="play">
        <p class="play__hint">
          Engine "{scene.engine}" không có họ luật "{play.rule}", nên thế này chưa chơi được.
        </p>
        {onClose ? (
          <button class="tool" onClick={onClose}>
            Đóng
          </button>
        ) : null}
      </section>
    );
  }

  const winning = new Set(solved.value?.winningMoves ?? []);

  return (
    <section class="play">
      <header class="play__bar">
        <TurnChips session={session} rules={rules} />
        <div class="tools">
          <button class="tool" onClick={() => setSession(undoMove(session, rules) ?? session)} disabled={session.history.length === 0}>
            ↶ Lùi một nước
          </button>
          <button class="tool" onClick={() => { setSession(resetPlay(session, rules)); setRefusal(null); setAsked(false); }} disabled={session.history.length === 0}>
            ⟲ Chơi lại
          </button>
          <button class="tool" onClick={draft} disabled={session.history.length === 0}>
            Ghi ván thành draft
          </button>
          {onClose ? (
            <button class="tool" onClick={onClose}>
              Đóng
            </button>
          ) : null}
        </div>
      </header>

      <div class="sandbox__body">
        {/* Bàn chơi to hơn hình trong lời giải, và cố ý: ở đây mỗi ô là một **nút bấm**,
            không phải một minh hoạ. Hình trong lời giải giữ đúng $44$px một ô để khớp
            với step gốc; chỗ này thì lấp đầy cột và chỉ dừng lại ở một trần đọc được. */}
        <div class="canvas play__stage">
          <svg
            ref={svgRef}
            class="play__canvas"
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            // Rê tới đâu thì ô ấy sáng: đây là **nửa còn lại** của "chọn nước trên
            // hình". Không có nó thì người chơi chỉ biết mình bấm trúng gì *sau khi*
            // bấm, và một nước Chomp thì không lấy lại được bằng cách bấm lần nữa.
            onPointerMove={(event: PointerEvent) => {
              const move = moveAt(event);
              setHovered(move?.id ?? null);
            }}
            onPointerLeave={() => setHovered(null)}
            onPointerDown={(event: PointerEvent) => {
              event.preventDefault();
              const move = moveAt(event);
              if (move) run(move.id);
            }}
          />
        </div>

        <aside class="sandbox__side">
          {session.over ? (
            <p class="play__winner">
              <strong>{nameOf(rules, session.winner as PlayPlayer)}</strong> thắng
              <span class="play__winner-why">{session.ended}</span>
            </p>
          ) : (
            <section class="play__moves">
              <h3>Nước đi của bạn</h3>
              <ul class="moves__list">
                {session.moves.map((move: Move) => (
                  <li key={move.id}>
                    <button
                      class={`moves__item${winning.has(move.id) ? ' moves__item--win' : ''}`}
                      onPointerEnter={() => setHovered(move.id)}
                      onPointerLeave={() => setHovered((at) => (at === move.id ? null : at))}
                      onFocus={() => setHovered(move.id)}
                      onBlur={() => setHovered((at) => (at === move.id ? null : at))}
                      onClick={() => run(move.id)}
                    >
                      {move.label}
                      {winning.has(move.id) ? <span class="play__star" title="Nước thắng">★</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {refusal ? <p class="moves__refusal">{refusal}</p> : null}

          <Advice
            asked={asked}
            onAsk={() => setAsked(true)}
            over={session.over}
            pending={solved.pending}
            error={solved.error}
            refused={solved.value?.refused ?? null}
            winner={solved.value?.winner ?? null}
            toMove={session.toMove}
            rules={rules}
          />

          <History session={session} rules={rules} />
        </aside>
      </div>
    </section>
  );
}

/**
 * **Đến lượt ai** — câu hỏi trung tâm của một ván, nên nó đứng ở góc trên bên trái.
 *
 * Hai chip luôn cùng có mặt, chỉ một cái sáng: hiện *một* chip "đang là lượt X" thì mắt
 * không có gì để so, và ở ván partizan người chơi còn cần thấy bên kia là ai.
 */
function TurnChips({ session, rules }: { session: PlaySession; rules: PlayRules }) {
  const players: PlayPlayer[] = ['left', 'right'];
  return (
    <div class="turn" role="status" aria-live="polite">
      {players.map((player) => {
        const active = !session.over && session.toMove === player;
        const won = session.over && session.winner === player;
        return (
          <span
            key={player}
            class={`turn__chip${active ? ' turn__chip--on' : ''}${won ? ' turn__chip--won' : ''}`}
          >
            <span class={`turn__pip turn__pip--${player}`} aria-hidden="true" />
            {nameOf(rules, player)}
          </span>
        );
      })}
    </div>
  );
}

/**
 * "Ai thắng thế này?" — và nó **hỏi mới trả lời**.
 *
 * Chạy solver mỗi nước là chạy một phép duyệt hàng nghìn thế cho một câu hỏi người chơi
 * chưa đặt; và tệ hơn, nó **làm hỏng trò chơi** — ngôi sao hiện sẵn trên nước thắng thì
 * không còn gì để nghĩ. Một nút, bấm thì hiện, đi một nước thì tắt lại.
 */
function Advice(props: {
  asked: boolean;
  over: boolean;
  pending: boolean;
  error: string | null;
  refused: string | null;
  winner: PlayPlayer | null;
  toMove: PlayPlayer;
  rules: PlayRules;
  onAsk: () => void;
}) {
  if (props.over) return null;
  if (!props.asked) {
    return (
      <button class="tool play__ask" onClick={props.onAsk}>
        Ai thắng thế này?
      </button>
    );
  }
  if (props.pending) return <p class="play__hint">Đang duyệt các thế…</p>;
  // Lời từ chối của solver là **chữ**, và nó nói ra nguyên văn: "không gian thế quá lớn"
  // là một câu trả lời có nội dung, không phải một sự cố cần giấu.
  if (props.error) return <p class="moves__refusal">{props.error}</p>;
  if (props.refused) return <p class="moves__refusal">{props.refused}</p>;
  if (!props.winner) return null;

  const mine = props.winner === props.toMove;
  return (
    <p class={`play__advice${mine ? ' play__advice--mine' : ''}`}>
      {mine ? (
        <>
          <strong>Bạn thắng</strong> nếu đi đúng —{' '}
          <span class="play__nowrap">nước thắng có ★</span>
        </>
      ) : (
        <>
          <strong>{nameOf(props.rules, props.winner)}</strong> thắng nếu đi đúng
        </>
      )}
    </p>
  );
}

/** Lịch sử ván. Đánh số theo **nước**, không theo lượt: một nước là một dòng. */
function History({ session, rules }: { session: PlaySession; rules: PlayRules }) {
  if (session.history.length === 0) return null;
  return (
    <section class="play__history">
      <h3>Đã đi</h3>
      <ol class="play__log">
        {session.history.map((record, i) => (
          <li key={`${i}-${record.moveId}`} class={`play__log-item play__log-item--${record.by}`}>
            <span class="play__log-no">{i + 1}</span>
            <span class="play__log-who">{nameOf(rules, record.by)}</span>
            <span class="play__log-what">{record.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
