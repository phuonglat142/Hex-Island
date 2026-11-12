// `.board-wrap`: where the 3D island (or, without WebGL, the flat SVG map) is mounted, with the panels that
// float over it. The board is created once (dynamic import of Board3D, so the menu never pays for three.js);
// after that the controller effect calls `board.render(view, boardView)` whenever the inputs change.
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { App } from '@app/index';
import { BoardView } from '@board/BoardView';
import type { BoardRenderer } from '@board/BoardRenderer';
import { Jit } from '@ui/components/Jit';
import { px } from '@ui/components/PixelIcon';
import { toast } from '@ui/dom';
import { Banner, Offer, RollLog } from './BoardOverlays';
import { boardPing } from './fx';
import { boardNudge, boards, boardSig, countRender, pick, topView } from './signals';

export function BoardHost(): JSX.Element {
  countRender('BoardHost');
  const wrap = useRef<HTMLElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = wrap.current!;
    let dead = false;
    let board: BoardRenderer | null = null;
    // the bots wait for the island: their first houses are placed on a board the player can see
    App.botsHeld = true;
    const release = () => {
      if (!App.botsHeld) return;
      App.botsHeld = false;
      App.scheduleBots();
    };
    // the flat map is up at once (no blank board while three.js, the island and the shaders get ready), drawn
    // over the 3D canvas, which builds underneath (`boards.warming` gets the same renders) and takes over when ready
    const flat = new BoardView(el);
    flat.placeholder(true);
    el.classList.add('b3d-warming');
    board = flat;
    boards.any = flat;
    boardSig.value = flat;
    (async () => {
      try {
        const { Board3D } = await import('@board/Board3D');
        if (dead) return;
        const b = await Board3D.create(el);
        if (dead) return b.dispose();
        boards.warming = b;
        boardNudge.value++; // paint once more so the 3D board gets the current state (and starts its build)
        await b.ready;
        boards.warming = null;
        if (dead) return b.dispose();
        // swap only once the island has been drawn (two frames: the first one may still be in flight)
        await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
        if (dead) return b.dispose();
        board = b;
        boards.d3 = b;
        boards.any = b;
        b.onSlow = () => toast('Máy hơi chậm: thử chọn mức "Máy yếu" trong ☰ Menu → Đồ họa 3D', 'info', 7000);
        b.onPing = boardPing;
        boardSig.value = b;
        flat.dispose();
        el.classList.remove('b3d-warming');
      } catch (e) {
        console.error(e);
        boards.warming = null;
        if (dead) return;
        // the flat map simply stays
        toast('Không tải được bản đồ 3D (mất mạng hoặc thiếu WebGL?): chuyển sang bản đồ phẳng', 'error', 4000);
        flat.placeholder(false);
        el.classList.remove('b3d-warming');
        for (const c of [...el.querySelectorAll('canvas.board-3d, .labels-3d, .vignette-css')]) c.remove();
      }
      if (dead) return;
      setLoading(false);
      release();
    })();
    return () => {
      dead = true;
      App.botsHeld = false;
      boardSig.value = null;
      const w = boards.warming;
      boards.any = boards.d3 = boards.warming = null;
      if (board) board.dispose();
      if (board !== flat) flat.dispose();
      if (w && w !== board) w.dispose();
    };
  }, []);

  const toggleTopView = () => {
    const b = boards.any;
    if (!b || !b.setTopView) return;
    b.setTopView(!b.top);
    topView.value = !!b.top;
  };
  const zoom = (k: number) => {
    const b = boards.any;
    if (b) b.setZoom(b.zoom * k);
  };
  const top = topView.value;

  return (
    <section class="board-wrap" ref={wrap} onClick={e => {
      // a click on the panels around the map (not the canvas) drops the armed build button
      if (pick.peek() && (e.target as Element).tagName !== 'CANVAS') pick.value = null;
    }}>
      <Banner />
      <Offer />
      <RollLog />
      <div class="zoom-ctrl">
        <button type="button" class={'btn' + (top ? ' active' : '')} title={top ? 'Về góc nhìn nghiêng' : 'Nhìn từ trên xuống'} onClick={toggleTopView}>{px('🗺️', 20)}</button>
        <button type="button" class="btn" title="Phóng to" onClick={() => zoom(1.25)}>+</button>
        <button type="button" class="btn" title="Thu nhỏ" onClick={() => zoom(1 / 1.25)}>−</button>
        <button type="button" class="btn" title="Căn giữa" onClick={() => boards.any?.resetView()}>⤢</button>
      </div>
      {loading && <Jit class="board-loading mini" text="🏝️ Đang dựng đảo 3D..." size={14} />}
    </section>
  );
}
