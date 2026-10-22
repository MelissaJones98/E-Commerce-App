// Tests for addressLines() (address.js): turning the API's address into the lines to print.

import { addressLines } from './address';

const full = {
  id: 1,
  line_1: 'Flat 2',
  line_2: '10 Downing Street',
  city: 'London',
  region: 'Greater London',
  postal_code: 'SW1A 2AA',
  country_code: 'GB',
};

test('a full address gives six lines, in order', () => {
  expect(addressLines(full)).toEqual([
    'Flat 2',
    '10 Downing Street',
    'London',
    'Greater London',
    'SW1A 2AA',
    'GB',
  ]);
});

test('missing parts (null) are skipped', () => {
  expect(addressLines({ ...full, line_1: '10 Downing Street', line_2: null, region: null })).toEqual([
    '10 Downing Street',
    'London',
    'SW1A 2AA',
    'GB',
  ]);
});

test('empty parts are skipped too', () => {
  expect(addressLines({ ...full, line_2: '', region: '' })).toEqual([
    'Flat 2',
    'London',
    'SW1A 2AA',
    'GB',
  ]);
});
