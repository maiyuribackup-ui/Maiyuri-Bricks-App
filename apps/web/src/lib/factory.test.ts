import { describe, expect, it } from 'vitest';
import {
  deliveryLabel,
  factoryWeekEnd,
  factoryWeekStart,
  productMeta,
} from './factory';

describe('factoryWeekStart (Sat–Fri reporting week)', () => {
  it('maps a Saturday to itself', () => {
    // 2026-07-04 is a Saturday
    expect(factoryWeekStart('2026-07-04')).toBe('2026-07-04');
  });

  it('maps a Sunday to the previous day (Saturday)', () => {
    expect(factoryWeekStart('2026-07-05')).toBe('2026-07-04');
  });

  it('maps a Friday to the previous Saturday (end of week)', () => {
    // 2026-07-10 is a Friday → week started 2026-07-04
    expect(factoryWeekStart('2026-07-10')).toBe('2026-07-04');
  });

  it('handles month boundaries', () => {
    // 2026-08-01 is a Saturday; 2026-07-31 (Friday) belongs to the week of 25 Jul
    expect(factoryWeekStart('2026-08-01')).toBe('2026-08-01');
    expect(factoryWeekStart('2026-07-31')).toBe('2026-07-25');
  });

  it('handles year boundaries', () => {
    // 2027-01-01 is a Friday → its Sat–Fri week began 2026-12-26 (Saturday)
    expect(factoryWeekStart('2027-01-01')).toBe('2026-12-26');
  });

  it('week end is always 6 days after week start', () => {
    expect(factoryWeekEnd('2026-07-04')).toBe('2026-07-10');
    expect(factoryWeekEnd('2026-07-10')).toBe('2026-07-10');
    expect(factoryWeekEnd('2026-07-31')).toBe('2026-07-31');
  });

  it('never shifts a day across the IST/UTC boundary (component parsing)', () => {
    // If the implementation used new Date('YYYY-MM-DD') (UTC midnight), local
    // IST rendering would move Saturdays back to Fridays. Component parsing
    // keeps the calendar date intact regardless of host timezone.
    for (const sat of ['2026-07-04', '2026-07-11', '2026-08-08', '2026-12-26']) {
      expect(factoryWeekStart(sat)).toBe(sat);
    }
  });
});

describe('productMeta', () => {
  it('derives type, size and labour rate from the code', () => {
    expect(productMeta('MIB-8')).toEqual({ type: 'MIB', size: '8"', labourRate: 7 });
    expect(productMeta('MIB-6')).toEqual({ type: 'MIB', size: '6"', labourRate: 6 });
    expect(productMeta('CIB-8')).toEqual({ type: 'CIB', size: '8"', labourRate: 7 });
    expect(productMeta('CIB-6')).toEqual({ type: 'CIB', size: '6"', labourRate: 6 });
  });
});

describe('label composers', () => {
  it('composes the spec example label', () => {
    expect(
      deliveryLabel({
        delivery_date: '2026-08-04',
        customer_name: 'Umapathi Sriperumbudur',
        qty: 1000,
        product_code: 'CIB-6',
      }),
    ).toBe('04/08 Umapathi Sriperumbudur 1000 CIB-6');
  });
});
