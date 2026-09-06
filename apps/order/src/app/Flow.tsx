import { useEffect, useState } from 'react';
import { useT } from '@veyroxai/ui';
import type { MenuModifierGroup } from '@veyroxai/contracts';
import { useReadySession } from '../shared/session-context.js';
import { useCart, type CartLine } from '../shared/cart-store.js';
import { useRoute } from './router.js';
import { useMenu } from '../features/menu/hooks/useMenu.js';
import { MenuScreen } from '../features/menu/ui/MenuScreen.js';
import { ItemDetailScreen } from '../features/item/ui/ItemDetailScreen.js';
import { useQuote } from '../features/cart/hooks/useQuote.js';
import { linesToRemove } from '../features/cart/usecases/quoteCart.js';
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
  const session = useReadySession();
  const cart = useCart();
  const menu = useMenu(session.session.menuVersion);
  const quote = useQuote();
  const place = usePlaceOrder();

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [reconciled, setReconciled] = useState(false);

  // Correct the cart when a quote reports something went unavailable (FR-2.7).
  useEffect(() => {
    if (!quote.quote) {
      return;
    }
    const dead = linesToRemove(cart.lines, quote.quote);
    if (dead.length > 0) {
      dead.forEach((id) => cart.removeLine(id));
      setReconciled(true);
    }
  }, [quote.quote, cart]);

  // Placement outcomes that change the route.
  useEffect(() => {
    if (place.outcome?.kind === 'placed') {
      route.navigate(`/o/${place.outcome.order.orderId}`, { replace: true });
    }
  }, [place.outcome, route]);

  const groupsFor: Map<string, MenuModifierGroup> = menu.menu?.groupsById ?? new Map();

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
    return (
      <OpenOrderBlockScreen
        orderNumber={place.outcome.orderNumber}
        onView={() =>
          route.navigate(`/o/${place.outcome!.kind === 'open_order' ? place.outcome.orderId : ''}`)
        }
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
                  acc[g.id] = editing.modifierOptionIds.filter((id) =>
                    g.options.some((o) => o.id === id),
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
          } else {
            cart.addLine(line);
          }
          route.navigate('/menu');
        }}
      />
    );
  }

  if (route.name === 'cart') {
    return (
      <CartScreen
        locale={locale}
        quote={quote.quote}
        loading={quote.loading}
        errorCode={quote.errorCode}
        reconciled={reconciled}
        onEditLine={(line: CartLine) => {
          setEditingLineId(line.lineId);
          route.navigate(`/item/${line.menuItemId}`);
        }}
        onCheckout={() => route.navigate('/checkout')}
        onBack={() => route.navigate('/menu')}
      />
    );
  }

  if (route.name === 'checkout') {
    if (!quote.quote) {
      route.navigate('/cart', { replace: true });
      return <LoadingScreen />;
    }
    return (
      <CheckoutScreen
        locale={locale}
        quote={quote.quote}
        placing={place.placing}
        outcome={place.outcome}
        onBack={() => route.navigate('/cart')}
        onEditCart={() => route.navigate('/cart')}
        onPlace={(note, expectedTotalMinor) => {
          void place.submit({ customerNote: note, expectedTotalMinor });
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
