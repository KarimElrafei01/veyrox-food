import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Icon,
  Price,
  Screen,
  Skeleton,
  Stack,
  StickyBar,
  useT,
} from '@veyroxai/ui';
import type { Locale } from '@veyroxai/i18n';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import { useReadySession } from '../../../shared/session-context.js';
import { useCart } from '../../../shared/cart-store.js';
import type { ResolvedMenu } from '../../../shared/menu-model.js';
import { MenuItemCard } from './MenuItemCard.js';
import styles from './MenuScreen.module.css';

interface MenuScreenProps {
  menu: ResolvedMenu | null;
  status: 'loading' | 'ready' | 'error';
  locale: Locale;
  quoteTotalMinor: number | null;
  onOpenItem: (itemId: string) => void;
  onQuickAdd: (itemId: string) => void;
  onStepItem: (itemId: string, qty: number) => void;
  onViewCart: () => void;
}

function localized(map: { en: string; 'ar-EG'?: string }, locale: Locale): string {
  return (locale === 'ar-EG' && map['ar-EG']) || map.en;
}

export function MenuScreen({
  menu,
  status,
  locale,
  quoteTotalMinor,
  onOpenItem,
  onQuickAdd,
  onStepItem,
  onViewCart,
}: MenuScreenProps): React.JSX.Element {
  const { t } = useT();
  const session = useReadySession();
  const cart = useCart();
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const categories = useMemo(() => menu?.categories ?? [], [menu]);
  const visible = useMemo(
    () => (activeCat ? categories.filter((c) => c.id === activeCat) : categories),
    [activeCat, categories],
  );

  const qtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart.lines) {
      map.set(line.menuItemId, (map.get(line.menuItemId) ?? 0) + line.qty);
    }
    return map;
  }, [cart.lines]);

  return (
    <Screen
      header={<WebviewHeader title={t('menu.heading')} subtitle={t('menu.subheading')} />}
      footer={
        cart.count > 0 ? (
          <StickyBar>
            <Button variant="espresso" fullWidth spread size="lg" onClick={onViewCart}>
              <span className={styles.cartCta}>
                <span className={styles.cartCount}>{cart.count}</span>
                {t('menu.viewCart')}
              </span>
              <span className={styles.cartTotal}>
                {quoteTotalMinor != null ? <Price minor={quoteTotalMinor} /> : null}
                <Icon name="arrow-forward" size={18} />
              </span>
            </Button>
          </StickyBar>
        ) : null
      }
    >
      {!session.store.isOpen ? (
        <div className={styles.banner}>
          <Alert tone="warning" title={session.tenant.name}>
            {t('store.browseOnly')}
          </Alert>
        </div>
      ) : null}

      {menu?.staleAgainstVersion ? (
        <div className={styles.banner}>
          <Alert tone="info">{t('menu.availabilityStale')}</Alert>
        </div>
      ) : null}

      {categories.length > 1 ? (
        <div className={styles.pills}>
          <Chip active={activeCat === null} onClick={() => setActiveCat(null)}>
            {t('menu.allCategories')}
          </Chip>
          {categories.map((cat) => (
            <Chip key={cat.id} active={activeCat === cat.id} onClick={() => setActiveCat(cat.id)}>
              {localized(cat.name, locale)}
            </Chip>
          ))}
        </div>
      ) : null}

      {status === 'loading' ? (
        <Stack gap="sm">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={116} radius="var(--vx-radius-md)" />
          ))}
        </Stack>
      ) : status === 'error' ? (
        <Alert tone="danger" title={t('common.errorTitle')}>
          {t('common.errorBody')}
        </Alert>
      ) : categories.length === 0 ? (
        <Alert tone="info">{t('menu.empty')}</Alert>
      ) : (
        <Stack gap="lg">
          {visible.map((cat) => (
            <section key={cat.id} className={styles.category}>
              <h2 className={styles.categoryTitle}>{localized(cat.name, locale)}</h2>
              <Stack gap="sm">
                {cat.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    qtyInCart={qtyByItem.get(item.id) ?? 0}
                    onOpen={() => onOpenItem(item.id)}
                    onQuickAdd={() => onQuickAdd(item.id)}
                    onStep={(qty) => onStepItem(item.id, qty)}
                  />
                ))}
              </Stack>
            </section>
          ))}
        </Stack>
      )}
    </Screen>
  );
}
