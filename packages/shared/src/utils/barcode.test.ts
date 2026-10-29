import { describe, expect, it } from 'vitest';
import { barcodeVariants, extractBarcode } from './barcode';

describe('extractBarcode', () => {
  it('returns a plain product number as-is (trimmed)', () => {
    expect(extractBarcode(' 5000129396980 ')).toBe('5000129396980');
    expect(extractBarcode('12345678')).toBe('12345678');
  });

  it('pulls the number out of a retailer label', () => {
    expect(extractBarcode('COLA5000129396980V1')).toBe('5000129396980');
  });

  it('takes the longest run of 8-14 digits', () => {
    expect(extractBarcode('B12345678-5000129396980')).toBe('5000129396980');
  });

  it('returns the text unchanged when there is no usable number', () => {
    expect(extractBarcode('LOT-AB-77')).toBe('LOT-AB-77');
  });
});

describe('barcodeVariants', () => {
  it('includes the scan as-is and the digits without leading zeros', () => {
    const v = barcodeVariants('0012345678905');
    expect(v).toContain('0012345678905');
    expect(v).toContain('12345678905');
  });

  it('matches a UPC-A (12 digits) against the same code stored as EAN-13 (13 digits) and vice versa', () => {
    expect(barcodeVariants('012345678905')).toContain('0012345678905');
    expect(barcodeVariants('0012345678905')).toContain('012345678905');
  });

  it('pads a short EAN-8 to the longer forms', () => {
    const v = barcodeVariants('96385074');
    expect(v).toEqual(expect.arrayContaining(['96385074', '000096385074', '0000096385074']));
  });

  it('ignores non-digits', () => {
    expect(barcodeVariants('50-0012-9396980')).toContain('5000129396980');
  });
});
