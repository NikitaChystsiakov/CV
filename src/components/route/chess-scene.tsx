"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { CHESS_GAMES } from "@/lib/chess-games";
import { positionAfter, type Piece } from "@/lib/chess-position";
import { CHESS_ASSETS } from "@/lib/scene-assets";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

/**
 * Шахматная площадка из ассетов владельца: стол, доска на нём и фигуры, которые
 * разыгрывают партию из `chess-games.ts`.
 *
 * Геометрия доски измерена по файлу `chessboard` (640×424): поле клеток — ромб
 * с вершинами (320,21) (26,187) (320,363) (614,187). Рамка неровная — 21px
 * сверху, 26 по бокам, 11 снизу, доска нарисована с лёгкой перспективой, —
 * поэтому вершины заданы явно, а не «ромб минус рамка». Клетка a1 — у нижней
 * вершины, h8 — у верхней; первый ряд идёт от нижней вершины к правой, так что
 * белые стоят ближе к зрителю.
 *
 * Якорь фигуры — центр нижней грани основания. Основание — ромб шириной во всю
 * фигуру, его центр лежит на 0,3 ширины выше нижней точки (половина ширины на
 * тангенс 31°). Взятый на глаз процент высоты ставил фигуры криво: у пешки и
 * короля разные пропорции, а основание у них одно.
 *
 * Чёрных фигур пока нет — владелец их генерирует. До тех пор за чёрных ходят
 * затемнённые белые: один фильтр в `.chess-black`, снять его — дело одной
 * строки, когда файлы придут.
 */

const BOARD = CHESS_ASSETS.board;
const TABLE = CHESS_ASSETS.table;

/** Вершины поля клеток в долях файла доски. */
const LEFT = { x: 26 / 640, y: 187 / 424 };
const BOTTOM = { x: 320 / 640, y: 363 / 424 };
const RIGHT = { x: 614 / 640, y: 187 / 424 };

/** Центр клетки в долях файла доски. */
function squareCenter(file: number, rank: number) {
  const alongFile = { x: (RIGHT.x - BOTTOM.x) / 8, y: (RIGHT.y - BOTTOM.y) / 8 };
  const alongRank = { x: (LEFT.x - BOTTOM.x) / 8, y: (LEFT.y - BOTTOM.y) / 8 };

  return {
    x: BOTTOM.x + (file + 0.5) * alongFile.x + (rank + 0.5) * alongRank.x,
    y: BOTTOM.y + (file + 0.5) * alongFile.y + (rank + 0.5) * alongRank.y,
  };
}

/** Центр основания фигуры выше её нижней точки на эту долю ширины. */
const BASE_LIFT = 0.3;

/**
 * Центр столешницы в долях файла стола (640×645): вершины верхней грани —
 * (319,0), (0,179), (638,178). Центр поля клеток доски ставится ровно сюда;
 * подобранный на глаз отступ давал доску на 24px ниже центра, и она выглядела
 * съехавшей к ближнему краю.
 */
const TABLE_TOP_CENTER = { x: 319 / 640, y: 179 / 645 };
const BOARD_FIELD_CENTER = { x: 320 / 640, y: (21 + 363) / 2 / 424 };

const MOVE_EVERY_MS = 2600;
const PAUSE_AT_END_MS = 6000;

export function ChessScene() {
  const reduced = usePrefersReducedMotion();
  const [gameIndex, setGameIndex] = useState(0);
  const [step, setStep] = useState(0);
  const game = CHESS_GAMES[gameIndex];

  useEffect(() => {
    if (reduced) return;

    const finished = step >= game.moves.length;
    const timer = setTimeout(
      () => {
        if (finished) {
          setStep(0);
          setGameIndex((i) => (i + 1) % CHESS_GAMES.length);
        } else {
          setStep((s) => s + 1);
        }
      },
      finished ? PAUSE_AT_END_MS : MOVE_EVERY_MS,
    );

    return () => clearTimeout(timer);
  }, [step, game, reduced]);

  // В статичном режиме доска показывает финал партии
  const pieces = positionAfter(game.moves, reduced ? game.moves.length : step);

  const tableHeight = (TABLE.display * TABLE.height) / TABLE.width;
  const boardHeight = (BOARD.display * BOARD.height) / BOARD.width;
  const boardLeft = TABLE.display * TABLE_TOP_CENTER.x - BOARD.display * BOARD_FIELD_CENTER.x;
  const boardTop = tableHeight * TABLE_TOP_CENTER.y - boardHeight * BOARD_FIELD_CENTER.y;

  return (
    <div
      data-chess-scene
      className="relative"
      style={{ width: `${TABLE.display}px` }}
    >
      <div
        aria-hidden
        className="absolute inset-x-[10%] bottom-0 -z-10 h-[14%]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--color-shadow) 40%, transparent), transparent)",
        }}
      />

      <Image
        src={TABLE.src}
        alt=""
        width={TABLE.width}
        height={TABLE.height}
        sizes={`${TABLE.display}px`}
        className="scene-art h-auto w-full select-none"
      />

      <div
        className="absolute"
        style={{
          top: `${boardTop}px`,
          left: `${boardLeft}px`,
          width: `${BOARD.display}px`,
          height: `${boardHeight}px`,
        }}
      >
        <Image
          src={BOARD.src}
          alt=""
          width={BOARD.width}
          height={BOARD.height}
          sizes={`${BOARD.display}px`}
          className="scene-art h-auto w-full select-none"
        />

        {pieces.map((piece) => (
          <ChessPiece key={piece.id} piece={piece} boardWidth={BOARD.display} boardHeight={boardHeight} />
        ))}
      </div>
    </div>
  );
}

function ChessPiece({
  piece,
  boardWidth,
  boardHeight,
}: {
  piece: Piece;
  boardWidth: number;
  boardHeight: number;
}) {
  const asset = CHESS_ASSETS[piece.kind];
  const { x, y } = squareCenter(piece.file, piece.rank);
  const height = (asset.display * asset.height) / asset.width;
  const anchorY = height - asset.display * BASE_LIFT;

  return (
    // Позиция — только transform: он анимируется без пересчёта раскладки.
    // Глубина: чем дальше клетка от нижней вершины, тем ниже слой
    <div
      className={`absolute left-0 top-0 transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        piece.white ? "" : "chess-black"
      }`}
      style={{
        width: `${asset.display}px`,
        zIndex: 20 - piece.file - piece.rank,
        opacity: piece.alive ? 1 : 0,
        transform: `translate(${x * boardWidth - asset.display / 2}px, ${y * boardHeight - anchorY}px)`,
      }}
    >
      <Image
        src={asset.src}
        alt=""
        width={asset.width}
        height={asset.height}
        unoptimized
        className="scene-art h-auto w-full select-none"
      />
    </div>
  );
}
