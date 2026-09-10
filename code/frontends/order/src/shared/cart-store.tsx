import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';
import type { QuoteOrderRequest } from '@veyroxai/contracts';

export interface CartLine {
  lineId: string;
  menuItemId: string;
  qty: number;
  modifierOptionIds: string[];
  /** Display-only snapshot so the cart renders without re-hitting the menu. */
  nameEn: string;
  nameAr?: string;
  modifierSummary?: string;
  imageUrl?: string | null;
  unitBasePriceMinor: number;
}

export type NewCartLine = Omit<CartLine, 'lineId'>;

/** A cart line for an item with no modifiers — used by the upsell card and the
 *  cross-sell screen (a configurable item goes through the item detail screen). */
export function simpleCartLine(item: {
  id: string;
  name: { en: string; 'ar-EG'?: string };
  imageUrl: string | null;
  basePriceMinor: number;
}): NewCartLine {
  return {
    menuItemId: item.id,
    qty: 1,
    modifierOptionIds: [],
    nameEn: item.name.en,
    nameAr: item.name['ar-EG'],
    modifierSummary: '',
    imageUrl: item.imageUrl,
    unitBasePriceMinor: item.basePriceMinor,
  };
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  addLine: (line: NewCartLine) => void;
  replaceLine: (lineId: string, line: NewCartLine) => void;
  setQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  toRequest: () => QuoteOrderRequest;
}

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(menuVersion: string): string {
  return `vx.cart.${menuVersion}`;
}

function load(menuVersion: string): CartLine[] {
  try {
    const raw = sessionStorage.getItem(storageKey(menuVersion));
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({
  menuVersion,
  children,
}: {
  menuVersion: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [lines, setLines] = useState<CartLine[]>(() => load(menuVersion));

  // A pinned menu version is stable for the session; if it ever changes, the old
  // cart no longer prices safely (F1.1 §6) — start fresh.
  useEffect(() => {
    setLines(load(menuVersion));
  }, [menuVersion]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(menuVersion), JSON.stringify(lines));
    } catch {
      /* private mode — cart lives in memory for this session */
    }
  }, [lines, menuVersion]);

  const value = useMemo<CartContextValue>(() => {
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      addLine: (line) => setLines((prev) => [...prev, { ...line, lineId: uuidv7() }]),
      replaceLine: (lineId, line) =>
        setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...line, lineId } : l))),
      setQty: (lineId, qty) =>
        setLines((prev) =>
          prev.flatMap((l) => (l.lineId === lineId ? (qty <= 0 ? [] : [{ ...l, qty }]) : [l])),
        ),
      removeLine: (lineId) => setLines((prev) => prev.filter((l) => l.lineId !== lineId)),
      clear: () => setLines([]),
      toRequest: () => ({
        items: lines.map((l) => ({
          clientLineId: l.lineId,
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
        })),
      }),
    };
  }, [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return ctx;
}
