import { describe, expect, it } from 'vitest';
import { EMPTY_BARCODE_FOOD, addedProduct, productBarcode, productText, readBarcodeFood, type BarcodeFoodText } from './barcodeFoods';

const bar = (patch: Partial<BarcodeFoodText> = {}): BarcodeFoodText => ({ ...EMPTY_BARCODE_FOOD, name: 'Protein bar', protein: '20', carbs: '22', fat: '8', ...patch });
const error = (text: BarcodeFoodText) => {
  const read = readBarcodeFood(text);
  return read.ok ? null : read.error;
};

describe('productBarcode', () => {
  it('keeps a product number of 6 to 14 digits, without spaces typed between the groups', () => {
    expect(productBarcode('5000129396980')).toBe('5000129396980');
    expect(productBarcode(' 5 000129 396980 ')).toBe('5000129396980');
    expect(productBarcode('12345')).toBeNull();
    expect(productBarcode('123456789012345')).toBeNull();
    expect(productBarcode('COLA5000129396980')).toBeNull();
    expect(productBarcode('')).toBeNull();
  });
});

describe('readBarcodeFood', () => {
  it('stores figures per 100 g as per gram, with no serving when none is given', () => {
    const read = readBarcodeFood(bar());
    expect(read).toEqual({
      ok: true,
      fields: { name: 'Protein bar', brand: null, protein: 0.2, carbs: 0.22, fat: 0.08, serving_options: null },
      per100: { calories: 20 * 4 + 22 * 4 + 8 * 9 },
      perServing: null,
    });
  });

  it("keeps the pack's serving as the food's own, and works out its calories", () => {
    const read = readBarcodeFood(bar({ brand: ' Grenade ', serving: 'bar', grams: '45' }));
    expect(read.ok && read.fields.brand).toBe('Grenade');
    expect(read.ok && read.fields.serving_options).toEqual([{ label: 'bar', grams: 45, default: true }]);
    expect(read.ok && Math.round(read.perServing!.calories)).toBe(Math.round(((20 * 4 + 22 * 4 + 8 * 9) * 45) / 100));
  });

  it('turns figures for one serving into per gram by its weight', () => {
    const read = readBarcodeFood(bar({ per: 'serving', serving: 'bottle', grams: '500', protein: '25', carbs: '10', fat: '2.5' }));
    expect(read.ok && read.fields).toMatchObject({ protein: 0.05, carbs: 0.02, fat: 0.005, serving_options: [{ label: 'bottle', grams: 500, default: true }] });
    expect(read.ok && read.perServing?.calories).toBeCloseTo(25 * 4 + 10 * 4 + 2.5 * 9);
  });

  it('calls an unnamed serving "serving", and reads a decimal comma', () => {
    const read = readBarcodeFood(bar({ per: 'serving', grams: '30,5', protein: '3,5', carbs: '10', fat: '5' }));
    expect(read.ok && read.fields.serving_options).toEqual([{ label: 'serving', grams: 30.5, default: true }]);
    expect(read.ok && read.fields.protein).toBeCloseTo(3.5 / 30.5, 6);
  });

  it('needs a name, and keeps names and brands to their lengths', () => {
    expect(error(bar({ name: '  ' }))).toMatch(/name/);
    expect(error(bar({ name: 'x'.repeat(101) }))).toMatch(/100 characters/);
    expect(error(bar({ name: 'x'.repeat(100) }))).toBeNull();
    expect(error(bar({ brand: 'x'.repeat(61) }))).toMatch(/brand/);
  });

  it('needs every figure, as numbers of 0 or more, and not all 0', () => {
    expect(error(bar({ fat: '' }))).toMatch(/0 if there is none/);
    expect(error(bar({ carbs: 'lots' }))).toMatch(/numbers/);
    expect(error(bar({ carbs: '-1' }))).toMatch(/numbers/);
    expect(error(bar({ protein: '0', carbs: '0', fat: '0' }))).toMatch(/at least one/);
    expect(error(bar({ protein: '0', carbs: '0', fat: '0.1' }))).toBeNull();
  });

  it('refuses figures the pack cannot have: the same limits as the database', () => {
    expect(error(bar({ protein: '101' }))).toMatch(/more protein than 100 g/);
    expect(error(bar({ protein: '100', carbs: '0', fat: '0' }))).toBeNull();
    expect(error(bar({ protein: '50', carbs: '50', fat: '6' }))).toMatch(/add up to more than 100 g/);
    expect(error(bar({ protein: '50', carbs: '50', fat: '5' }))).toBeNull();
    expect(error(bar({ per: 'serving', serving: 'bar', grams: '45', fat: '46', protein: '0', carbs: '0' }))).toMatch(/more fat than one bar \(45 g\)/);
  });

  it('needs the serving weight when the figures are per serving, or a serving name was given', () => {
    expect(error(bar({ per: 'serving', serving: 'bar' }))).toMatch(/what one bar weighs/);
    expect(error(bar({ serving: 'bar' }))).toMatch(/or leave the serving empty/);
    expect(error(bar({ grams: '0' }))).toMatch(/weighs in grams/);
    expect(error(bar({ grams: '5001' }))).toMatch(/heavier/);
    expect(error(bar({ serving: 'grams', grams: '10' }))).toMatch(/Call the serving/);
    expect(error(bar({ serving: 'x'.repeat(31), grams: '10' }))).toMatch(/30 characters/);
  });
});

describe('productText', () => {
  it("shows a scanned product's figures per 100 g, as the pack does", () => {
    expect(productText({ name: 'Bar', brand: null, protein: 0.2, carbs: 0.225, fat: 0.08 })).toMatchObject({ name: 'Bar', brand: '', per: '100g', protein: '20', carbs: '22.5', fat: '8' });
    const back = readBarcodeFood(productText({ name: 'Bar', brand: 'Tesco', protein: 0.2, carbs: 0.225, fat: 0.08 }));
    expect(back.ok && back.fields).toMatchObject({ brand: 'Tesco', protein: 0.2, carbs: 0.225, fat: 0.08 });
  });
});

describe('addedProduct', () => {
  it('reads what add_barcode_food answered, numbers as numbers', () => {
    const food = { id: 'f1', name: 'Bar', portion: '1 gram', protein: '0.2', carbs: 0.22, fat: 0.08, fibre: null, barcode: '5000129396980' };
    expect(addedProduct({ food, existing: true })).toEqual({ food: { ...food, protein: 0.2 }, existing: true });
    expect(addedProduct({ food })?.existing).toBe(false);
    expect(addedProduct(null)).toBeNull();
    expect(addedProduct({ existing: true })).toBeNull();
    expect(addedProduct({ food: { name: 'no id' } })).toBeNull();
  });
});
