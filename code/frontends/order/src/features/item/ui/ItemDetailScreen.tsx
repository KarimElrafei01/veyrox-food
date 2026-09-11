import {
  Button,
  Field,
  Icon,
  IconButton,
  Price,
  Screen,
  SelectionCardGroup,
  StickyBar,
  TextInput,
  useT,
} from '@veyroxai/ui';
import { translate, type Locale } from '@veyroxai/i18n';
import type { LoyaltyTier, MenuModifierGroup } from '@veyroxai/contracts';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import { menuImageSource } from '../../../shared/menu-image.js';
import type { NewCartLine } from '../../../shared/cart-store.js';
import type { ResolvedItem } from '../../../shared/menu-model.js';
import { PreparationIcon, preparationStyle } from '../components/PreparationIcon.js';
import { useItemConfigurator } from '../hooks/useItemConfigurator.js';
import { isWaived } from '../usecases/configureItem.js';
import styles from './ItemDetailScreen.module.css';

function localized(map: { en: string; 'ar-EG'?: string }, locale: Locale): string {
  return (locale === 'ar-EG' && map['ar-EG']) || map.en;
}

interface ItemDetailScreenProps {
  item: ResolvedItem;
  groups: MenuModifierGroup[];
  optionAvailable: (id: string) => boolean;
  tier: LoyaltyTier | null;
  locale: Locale;
  editingLineId: string | null;
  initial?: { byGroup: Record<string, string[]>; note: string; qty: number };
  onBack: () => void;
  onAdd: (line: NewCartLine) => void;
}

export function ItemDetailScreen({
  item,
  groups,
  optionAvailable,
  tier,
  locale,
  editingLineId,
  initial,
  onBack,
  onAdd,
}: ItemDetailScreenProps): React.JSX.Element {
  const { t } = useT();
  const cfg = useItemConfigurator(item, groups, tier, initial);
  const name = localized(item.name, locale);
  // The other language's name, shown small under the title (design 2.2).
  const secondaryName = (locale === 'ar-EG' ? item.name.en : item.name['ar-EG']) ?? null;

  const summaryFor = (): string =>
    [
      ...groups
        .flatMap((g) =>
          (cfg.selection.byGroup[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)),
        )
        .filter((o): o is NonNullable<typeof o> => o != null)
        .map((o) => localized(o.name, locale)),
      ...(cfg.selection.note.trim() ? [cfg.selection.note.trim()] : []),
    ].join(' · ');

  const submit = (): void => {
    const line = cfg.commit({ en: item.name.en, ar: item.name['ar-EG'] }, summaryFor());
    if (line) {
      onAdd(line);
    }
  };

  return (
    <Screen
      header={<WebviewHeader title={name} onBack={onBack} />}
      footer={
        <StickyBar>
          <div className={styles.bar}>
            <div className={styles.qty}>
              <IconButton
                icon="remove"
                label={t('common.close')}
                tone="surface"
                disabled={cfg.qty <= 1}
                onClick={() => cfg.setQty(Math.max(1, cfg.qty - 1))}
              />
              <span className={styles.qtyValue}>{cfg.qty}</span>
              <IconButton
                icon="add"
                label={t('menu.add')}
                tone="surface"
                disabled={cfg.qty >= 20}
                onClick={() => cfg.setQty(Math.min(20, cfg.qty + 1))}
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              spread
              iconStart="shopping-bag"
              onClick={submit}
            >
              <span className={styles.cta}>
                {editingLineId ? t('item.updateCart') : t('item.addToCart')}
              </span>
              <Price minor={cfg.estimateMinor} />
            </Button>
          </div>
          <p className={styles.confirmNote}>
            <Icon name="chat" size={14} />
            {t('item.confirmNote')}
          </p>
        </StickyBar>
      }
    >
      {item.imageUrl ? (
        <div
          className={styles.hero}
          style={{ backgroundImage: `url(${menuImageSource(item.imageUrl)})` }}
        >
          <div className={styles.heroOverlay}>
            <span className={styles.heroText}>
              <h1 className={styles.heroTitle}>{name}</h1>
              {secondaryName ? <span className={styles.heroSecondary}>{secondaryName}</span> : null}
            </span>
            <Price minor={item.basePriceMinor} tone="accent" size="lg" />
          </div>
        </div>
      ) : (
        <div className={styles.plainHeader}>
          <span className={styles.heroText}>
            <h1 className={styles.heroTitle}>{name}</h1>
            {secondaryName ? <span className={styles.heroSecondary}>{secondaryName}</span> : null}
          </span>
          <Price minor={item.basePriceMinor} tone="accent" size="lg" />
        </div>
      )}

      {item.description ? (
        <p className={styles.description}>{localized(item.description, locale)}</p>
      ) : null}

      <div className={styles.groups}>
        {groups.map((group) => {
          const err = cfg.validation.find((v) => v.groupId === group.id)?.error;
          // A single-choice group where no option changes the price reads as a
          // preparation style (design 2.2's Ice/Temperature) — compact tiles suit it
          // better than a price list. Any café's group of this shape gets the same
          // treatment; nothing here is specific to one item.
          const isPrepStyle =
            group.selection === 'single' && group.options.every((o) => o.priceDeltaMinor === 0);
          return (
            <SelectionCardGroup
              key={group.id}
              name={group.id}
              mode={group.selection}
              legend={localized(group.name, locale)}
              layout={isPrepStyle ? 'grid' : 'stack'}
              hint={
                group.selection === 'single'
                  ? t('item.selectOne')
                  : t('item.selectUpTo', { max: group.maxSelect })
              }
              error={
                err === 'required'
                  ? t('item.chooseRequired')
                  : err === 'min'
                    ? t('item.selectAtLeast', { min: group.minSelect })
                    : err === 'max'
                      ? t('item.selectUpTo', { max: group.maxSelect })
                      : undefined
              }
              value={cfg.selection.byGroup[group.id] ?? []}
              onToggle={(id) => cfg.choose(group, id)}
              options={group.options.map((o) => {
                const waived = isWaived(o.freeForTier, tier);
                return {
                  value: o.id,
                  label: localized(o.name, locale),
                  icon: isPrepStyle ? (
                    <PreparationIcon style={preparationStyle(o.name.en)} />
                  ) : undefined,
                  disabled: !optionAvailable(o.id),
                  trailing: isPrepStyle ? undefined : o.priceDeltaMinor === 0 ? (
                    <span className={styles.base}>{t('item.base')}</span>
                  ) : waived ? (
                    <span className={styles.waived}>
                      <Price minor={o.priceDeltaMinor} tone="muted" size="sm" strikethrough />
                      <span className={styles.free}>
                        {tier
                          ? t('item.freeForTier', {
                              tier: translate(locale, `loyalty.tier.${tier}`),
                            })
                          : t('common.free')}
                      </span>
                    </span>
                  ) : (
                    <Price minor={o.priceDeltaMinor} tone="accent" size="sm" />
                  ),
                };
              })}
            />
          );
        })}
      </div>

      <Field label={t('item.baristaNote')} hint={t('common.optional')}>
        {(id) => (
          <TextInput
            id={id}
            maxLength={140}
            placeholder={t('item.baristaNotePlaceholder')}
            value={cfg.selection.note}
            onChange={(e) => cfg.setNote(e.target.value)}
          />
        )}
      </Field>
    </Screen>
  );
}
