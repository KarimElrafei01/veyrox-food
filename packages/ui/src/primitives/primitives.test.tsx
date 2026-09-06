import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../react/LocaleProvider.js';
import { Button } from './Button/Button.js';
import { Chip } from './Chip/Chip.js';
import { Stepper } from './Stepper/Stepper.js';
import { Price } from './Price/Price.js';
import { SelectionCardGroup } from './SelectionCardGroup/SelectionCardGroup.js';

describe('Button', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and busy while loading', () => {
    render(<Button loading>Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});

describe('Chip', () => {
  it('reflects active state via aria-pressed', () => {
    render(<Chip active>Espresso</Chip>);
    expect(screen.getByRole('button', { name: 'Espresso' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('Stepper', () => {
  it('clamps at min and max', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Stepper
        value={1}
        min={1}
        max={3}
        onChange={onChange}
        decreaseLabel="less"
        increaseLabel="more"
      />,
    );
    expect(screen.getByRole('button', { name: 'less' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(
      <Stepper
        value={3}
        min={1}
        max={3}
        onChange={onChange}
        decreaseLabel="less"
        increaseLabel="more"
      />,
    );
    expect(screen.getByRole('button', { name: 'more' })).toBeDisabled();
  });
});

describe('Price (locale-aware, RTL)', () => {
  it('formats per the active locale', () => {
    render(
      <LocaleProvider initialLocale="ar-EG">
        <Price minor={7000} />
      </LocaleProvider>,
    );
    expect(screen.getByText('70 EGP')).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('SelectionCardGroup', () => {
  it('single mode uses radios, toggles, and shows a required error', () => {
    const onToggle = vi.fn();
    render(
      <SelectionCardGroup
        name="size"
        mode="single"
        legend="Size"
        error="Please choose an option"
        value={[]}
        onToggle={onToggle}
        options={[
          { value: 'r', label: 'Regular' },
          { value: 'l', label: 'Large' },
        ]}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Please choose an option');
    const large = screen.getByLabelText('Large');
    expect(large).toHaveAttribute('type', 'radio');
    fireEvent.click(large);
    expect(onToggle).toHaveBeenCalledWith('l');
  });

  it('multi mode uses checkboxes and reflects multiple selections', () => {
    const onToggle = vi.fn();
    render(
      <SelectionCardGroup
        name="extras"
        mode="multi"
        legend="Extras"
        value={['a', 'c']}
        onToggle={onToggle}
        options={[
          { value: 'a', label: 'Cinnamon' },
          { value: 'b', label: 'Nutmeg' },
          { value: 'c', label: 'Extra shot' },
        ]}
      />,
    );
    expect(screen.getByLabelText('Cinnamon')).toBeChecked();
    expect(screen.getByLabelText('Nutmeg')).not.toBeChecked();
    expect(screen.getByLabelText('Extra shot')).toBeChecked();
    expect(screen.getByLabelText('Nutmeg')).toHaveAttribute('type', 'checkbox');
    fireEvent.click(screen.getByLabelText('Nutmeg'));
    expect(onToggle).toHaveBeenCalledWith('b');
  });
});
