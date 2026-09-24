/**
 * Позиция на доске и применение ходов из `chess-games.ts`.
 *
 * Правил игры здесь нет и не нужно: партия записана заранее, а движок только
 * переставляет фигуры и снимает побитые. Каждая фигура несёт постоянный `id`,
 * чтобы на экране двигалась она сама, а не рисовалась новая на новом месте.
 */

export type PieceKind = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";

export type Piece = {
  id: string;
  kind: PieceKind;
  white: boolean;
  /** Вертикаль a–h как 0–7 */
  file: number;
  /** Горизонталь 1–8 как 0–7 */
  rank: number;
  /** Снятая фигура остаётся в списке невидимой, чтобы не прыгал порядок */
  alive: boolean;
};

const BACK_ROW: PieceKind[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

export function startingPosition(): Piece[] {
  const pieces: Piece[] = [];
  for (let file = 0; file < 8; file += 1) {
    pieces.push({ id: `w-${BACK_ROW[file]}-${file}`, kind: BACK_ROW[file], white: true, file, rank: 0, alive: true });
    pieces.push({ id: `w-pawn-${file}`, kind: "pawn", white: true, file, rank: 1, alive: true });
    pieces.push({ id: `b-pawn-${file}`, kind: "pawn", white: false, file, rank: 6, alive: true });
    pieces.push({ id: `b-${BACK_ROW[file]}-${file}`, kind: BACK_ROW[file], white: false, file, rank: 7, alive: true });
  }
  return pieces;
}

function square(text: string) {
  return { file: text.charCodeAt(0) - 97, rank: Number(text[1]) - 1 };
}

const PROMOTIONS: Record<string, PieceKind> = { q: "queen", r: "rook", b: "bishop", n: "knight" };

/** Один ход записи: `e2e4`, `e1g1+h1f1`, `e7e8=q`. */
export function applyMove(pieces: Piece[], move: string): Piece[] {
  let next = pieces;

  for (const part of move.split("+")) {
    const [path, promotion] = part.split("=");
    const from = square(path.slice(0, 2));
    const to = square(path.slice(2, 4));

    next = next.map((piece) => {
      if (!piece.alive) return piece;
      // Побитая фигура снимается с доски
      if (piece.file === to.file && piece.rank === to.rank) return { ...piece, alive: false };
      if (piece.file === from.file && piece.rank === from.rank) {
        return {
          ...piece,
          file: to.file,
          rank: to.rank,
          kind: promotion ? PROMOTIONS[promotion] ?? piece.kind : piece.kind,
        };
      }
      return piece;
    });
  }

  return next;
}

/** Позиция после первых `count` ходов партии. */
export function positionAfter(moves: string[], count: number): Piece[] {
  let pieces = startingPosition();
  for (let i = 0; i < Math.min(count, moves.length); i += 1) {
    pieces = applyMove(pieces, moves[i]);
  }
  return pieces;
}
