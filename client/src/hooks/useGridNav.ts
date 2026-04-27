import { useCallback, useRef } from "react";
import type React from "react";

/**
 * Reference to a single grid cell. The hook calls `focus()` to move
 * keyboard focus into the cell (typically focusing its underlying input).
 */
export interface GridCellRef {
  focus: () => void;
}

/**
 * API returned by `useGridNav`. Wire these into each editable cell.
 */
export interface GridNavApi {
  /**
   * Register (or unregister) a cell at the given coordinates.
   * Pass `null` on unmount to deregister.
   */
  registerCell: (row: number, col: number, ref: GridCellRef | null) => void;
  /**
   * Handle a keydown event from the cell's input. Performs Excel-like
   * navigation (Tab / Shift+Tab / Enter / Arrow keys / Escape).
   */
  handleKeyDown: (
    row: number,
    col: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
  /** Programmatically focus a specific cell (clamped to grid bounds). */
  focusCell: (row: number, col: number) => void;
}

/**
 * Excel-like keyboard navigation for a 2D grid of editable cells.
 *
 * Bindings:
 * - Tab / Shift+Tab            → next / previous column (wraps row)
 * - Enter / ArrowDown          → next row, same column
 * - ArrowUp                    → previous row, same column
 * - ArrowRight / ArrowLeft     → only when caret is at end / start of value
 * - Escape                     → no navigation (let parent handle cancel)
 *
 * @example
 * ```tsx
 * function BudgetGrid({ rows, cols }: { rows: number; cols: number }) {
 *   const nav = useGridNav(rows, cols);
 *
 *   return (
 *     <table>
 *       <tbody>
 *         {Array.from({ length: rows }).map((_, r) => (
 *           <tr key={r}>
 *             {Array.from({ length: cols }).map((_, c) => (
 *               <CellEditor
 *                 key={c}
 *                 ref={(ref) => nav.registerCell(r, c, ref)}
 *                 onKeyDown={(e) => nav.handleKeyDown(r, c, e)}
 *               />
 *             ))}
 *           </tr>
 *         ))}
 *       </tbody>
 *     </table>
 *   );
 * }
 *
 * // Inside CellEditor, expose a `focus()` method via useImperativeHandle:
 * useImperativeHandle(ref, () => ({
 *   focus: () => inputRef.current?.focus(),
 * }));
 * ```
 */
export function useGridNav(rowCount: number, colCount: number): GridNavApi {
  const cellsRef = useRef<Map<string, GridCellRef>>(new Map());

  // Keep latest grid bounds available to stable callbacks without
  // forcing them to be recreated when bounds change.
  const boundsRef = useRef({ rowCount, colCount });
  boundsRef.current = { rowCount, colCount };

  const registerCell = useCallback(
    (row: number, col: number, ref: GridCellRef | null) => {
      const key = `${row}_${col}`;
      if (ref === null) {
        cellsRef.current.delete(key);
      } else {
        cellsRef.current.set(key, ref);
      }
    },
    [],
  );

  const focusCell = useCallback((row: number, col: number) => {
    const { rowCount: rc, colCount: cc } = boundsRef.current;
    if (rc <= 0 || cc <= 0) return;
    const r = Math.max(0, Math.min(rc - 1, row));
    const c = Math.max(0, Math.min(cc - 1, col));
    const ref = cellsRef.current.get(`${r}_${c}`);
    if (ref) ref.focus();
  }, []);

  const handleKeyDown = useCallback(
    (
      row: number,
      col: number,
      e: React.KeyboardEvent<HTMLInputElement>,
    ) => {
      const { colCount: cc } = boundsRef.current;

      switch (e.key) {
        case "Tab": {
          e.preventDefault();
          if (e.shiftKey) {
            if (col === 0) {
              focusCell(row - 1, cc - 1);
            } else {
              focusCell(row, col - 1);
            }
          } else {
            if (col >= cc - 1) {
              focusCell(row + 1, 0);
            } else {
              focusCell(row, col + 1);
            }
          }
          return;
        }
        case "Enter":
        case "ArrowDown": {
          e.preventDefault();
          focusCell(row + 1, col);
          return;
        }
        case "ArrowUp": {
          e.preventDefault();
          focusCell(row - 1, col);
          return;
        }
        case "ArrowRight": {
          const input = e.currentTarget;
          const atEnd =
            input.selectionStart === input.value.length &&
            input.selectionEnd === input.value.length;
          if (!atEnd) return;
          e.preventDefault();
          if (col >= cc - 1) {
            focusCell(row + 1, 0);
          } else {
            focusCell(row, col + 1);
          }
          return;
        }
        case "ArrowLeft": {
          const input = e.currentTarget;
          const atStart =
            input.selectionStart === 0 && input.selectionEnd === 0;
          if (!atStart) return;
          e.preventDefault();
          if (col === 0) {
            focusCell(row - 1, cc - 1);
          } else {
            focusCell(row, col - 1);
          }
          return;
        }
        case "Escape": {
          // Parent handles cancel; do not preventDefault, do not navigate.
          return;
        }
        default:
          return;
      }
    },
    [focusCell],
  );

  return { registerCell, handleKeyDown, focusCell };
}
