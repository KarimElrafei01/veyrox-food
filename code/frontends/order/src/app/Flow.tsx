import { useEffect, useMemo, useState } from 'react';
import { useT } from '@veyroxai/ui';
import type { MenuModifierGroup, QuotedLine } from '@veyroxai/contracts';
import { useSession } from '../shared/session-context.js';
import { useCart, simpleCartLine, type CartLine } from '../shared/cart-store.js';
import { useCrossSell, markCrossSellSeen } from '../features/cross-sell/hooks/useCrossSell.js';
import { CrossSellScreen } from '../features/cross-sell/ui/CrossSellScreen.js';
import { useRoute } from './router.js';
import { useMenu } from '../features/menu/hooks/useMenu.js';
import { MenuScreen } from '../features/menu/ui/MenuScreen.js';
import { ItemDetailScreen } from '../features/item/ui/ItemDetailScreen.js';
import { useQuote } from '../features/cart/hooks/useQuote.js';
import { quotedLineFor, reconcileQuote } from '../features/cart/usecases/quoteCart.js';
import { CartScreen } from '../features/cart/ui/CartScreen.js';
import { usePlaceOrder } from '../features/checkout/hooks/usePlaceOrder.js';
import { CheckoutScreen } from '../features/checkout/ui/CheckoutScreen.js';
import { useOrderStatus } from '../features/order-status/hooks/useOrderStatus.js';
import { OrderStatusScreen } from '../features/order-status/ui/OrderStatusScreen.js';
import { LoadingScreen, OpenOrderBlockScreen } from '../features/session/ui/SessionScreens.js';
import { buildCartLine } from '../features/item/usecases/configureItem.js';

export function Flow(): React.JSX.Element {
  const route = useRoute();
  const { locale } = useT();
  const { session: maybeSession, token, resolve } = useSession();
  const session = maybeSession!; // Flow only renders when the session is ready
  const cart = useCart();
  const menu = useMenu(session.links);
  const quote = useQuote();
  const place = usePlaceOrder();
  const crossSell = useCrossSell();

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [reconciled, setReconciled] = useState(false);
  const [reconfigureLineIds, setReconfigureLineIds] = useState<string[]>([]);

  // Correct the cart from a quote's unavailable[] (FR-2.7): drop a line only when
  // the drink is gone; keep it (flagged) when only a modifier went out.
  useEffect(() => {
    if (!quote.quote) {
      return;
    }
    const { removeLineIds, reconfigureLineIds: toFix } = reconcileQuote(cart.lines, quote.quote);
    if (removeLineIds.length > 0) {
      removeLineIds.forEach((id) => cart.removeLine(id));
      setReconciled(true);
    }
    setReconfigureLineIds(toFix);
  }, [quote.quote, cart]);

  // MENU_VERSION_GONE (at quote or placement) means the client is on a version the
  // server no longer serves — re-resolve the session to pin a fresh one (F1.2 §5).
  useEffect(() => {
    if ((quote.errorCode === 'MENU_VERSION_GONE' || place.outcome?.kind === 'menu_gone') && token) {
      void resolve(token);
    }
  }, [quote.errorCode, place.outcome, token, resolve]);

  // Placement outcomes that change the route.
  useEffect(() => {
    if (place.outcome?.kind === 'placed') {
      route.navigate(`/o/${place.outcome.order.orderId}`, { replace: true });
    } else if (place.outcome?.kind === 'needs_review') {
      route.navigate('/cart', { replace: true });
    }
  }, [place.outcome, route]);

  const groupsFor: Map<string, MenuModifierGroup> = menu.menu?.groupsById ?? new Map();

  const quotedByLine = useMemo(() => {
    const map = new Map<string, QuotedLine>();
    if (quote.quote) {
      for (const line of cart.lines) {
        const q = quotedLineFor(quote.quote, line, cart.lines);
        if (q) {
          map.set(line.lineId, q);
        }
      }
    }
    return map;
  }, [quote.quote, cart.lines]);

  const findItem = (itemId: string) =>
    menu.menu?.categories.flatMap((c) => c.items).find((i) => i.id === itemId) ?? null;

  const quickAdd = (itemId: string): void => {
    const item = findItem(itemId);
    if (!item || !item.available) {
      return;
    }
    if (item.modifierGroupIds.length > 0) {
      route.navigate(`/item/${itemId}`);
      return;
    }
    cart.addLine(
      buildCartLine(
        item,
        [],
        { byGroup: {}, note: '' },
        1,
        { en: item.name.en, ar: item.name['ar-EG'] },
        '',
      ),
    );
  };

  const stepItem = (itemId: string, qty: number): void => {
    const line = cart.lines.find(
      (l) => l.menuItemId === itemId && (l.modifierSummary ?? '') === '',
    );
    if (line) {
      cart.setQty(line.lineId, qty);
    }
  };

  // — route → screen —

  if (route.name === 'status' && route.params.orderId) {
    return <StatusRoute orderId={route.params.orderId} storeName={session.tenant.name} />;
  }

  if (place.outcome?.kind === 'open_order') {
    const existing = place.outcome;
    return (
      <OpenOrderBlockScreen
        orderNumber={existing.orderNumber}
        onView={() => route.navigate(`/o/${existing.orderId}`)}
      />
    );
  }

  if (route.name === 'item' && route.params.itemId) {
    const item = findItem(route.params.itemId);
    if (!menu.menu) {
      return <LoadingScreen />;
    }
    if (!item) {
      route.navigate('/menu', { replace: true });
      return <LoadingScreen />;
    }
    const groups = item.modifierGroupIds
      .map((id) => groupsFor.get(id))
      .filter((g): g is NonNullable<typeof g> => g != null);
    const editing = editingLineId ? cart.lines.find((l) => l.lineId === editingLineId) : null;
    return (
      <ItemDetailScreen
        item={item}
        groups={groups}
        optionAvailable={menu.menu.optionAvailable}
        tier={session.customer.tier}
        locale={locale}
        editingLineId={editingLineId}
        initial={
          editing
            ? {
                byGroup: groups.reduce<Record<string, string[]>>((acc, g) => {
                  // Drop any option that is no longer available so the customer
                  // reconfigures onto a valid choice.
                  acc[g.id] = editing.modifierOptionIds.filter(
                    (id) => g.options.some((o) => o.id === id) && menu.menu!.optionAvailable(id),
                  );
                  return acc;
                }, {}),
                note: '',
                qty: editing.qty,
              }
            : undefined
        }
        onBack={() => {
          setEditingLineId(null);
          route.back();
        }}
        onAdd={(line) => {
          if (editingLineId) {
            cart.replaceLine(editingLineId, line);
            setEditingLineId(null);
            setReconfigureLineIds((ids) => ids.filter((id) => id !== editingLineId));
          } else {
            cart.addLine(line);
          }
          route.navigate(reconfigureLineIds.length > 1 ? '/cart' : '/menu');
        }}
      />
    );
  }

  if (route.name === 'cart') {
    return (
      <CartScreen
        locale={locale}
        quote={quote.quote}
        quotedByLine={quotedByLine}
        loading={quote.loading}
        errorCode={quote.errorCode}
        reconciled={reconciled}
        reconfigureLineIds={reconfigureLineIds}
        onEditLine={(line: CartLine) => {
          setEditingLineId(line.lineId);
          route.navigate(`/item/${line.menuItemId}`);
        }}
        onCheckout={() => route.navigate(crossSell.status === 'ready' ? '/pairings' : '/checkout')}
        onBack={() => route.navigate('/menu')}
      />
    );
  }

  if (route.name === 'crosssell') {
    if (crossSell.status !== 'ready') {
      route.navigate('/checkout', { replace: true });
      return <LoadingScreen />;
    }
    const toCheckout = () => {
      markCrossSellSeen();
      route.navigate('/checkout', { replace: true });
    };
    return (
      <CrossSellScreen
        pairings={crossSell.pairings}
        itemCount={cart.count}
        totalMinor={quote.quote?.totalMinor ?? null}
        locale={locale}
        onAdd={(item) => cart.addLine(simpleCartLine(item))}
        onSkip={toCheckout}
        onContinue={toCheckout}
      />
    );
  }

  if (route.name === 'checkout') {
    if (!quote.quote || reconfigureLineIds.length > 0) {
      route.navigate('/cart', { replace: true });
      return <LoadingScreen />;
    }
    return (
      <CheckoutScreen
        locale={locale}
        quote={quote.quote}
        quotedByLine={quotedByLine}
        askTableNumber={session.ordering.askTableNumber}
        placing={place.placing}
        outcome={place.outcome}
        onBack={() => route.navigate('/cart')}
        onEditCart={() => route.navigate('/cart')}
        onPlace={(note, expectedTotalMinor, tableLabel) => {
          void place.submit({ customerNote: note, expectedTotalMinor, tableLabel });
        }}
        onDismissPriceChange={place.clearOutcome}
      />
    );
  }

  // default: menu
  return (
    <MenuScreen
      menu={menu.menu}
      status={menu.status}
      locale={locale}
      quoteTotalMinor={quote.quote?.totalMinor ?? null}
      onOpenItem={(id) => {
        setEditingLineId(null);
        route.navigate(`/item/${id}`);
      }}
      onQuickAdd={quickAdd}
      onStepItem={stepItem}
      onViewCart={() => route.navigate('/cart')}
    />
  );
}

function StatusRoute({
  orderId,
  storeName,
}: {
  orderId: string;
  storeName: string;
}): React.JSX.Element {
  const { locale } = useT();
  const route = useRoute();
  const status = useOrderStatus(orderId);
  return (
    <OrderStatusScreen
      locale={locale}
      state={status.status}
      notFound={status.notFound}
      order={status.order}
      storeName={storeName}
      onRetry={status.refresh}
      onBackToMenu={() => route.navigate('/menu')}
    />
  );
}
