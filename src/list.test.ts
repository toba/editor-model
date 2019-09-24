import '@toba/test';
import { makeDuoList, makeTrioList } from './list';

const sampleDuo = () =>
   makeDuoList<string, number>(['one', 1, 'two', 2, 'three', 3]);

const sampleTrio = (d: Date) =>
   makeTrioList<string, number, Date>([
      'one',
      1,
      d,
      'two',
      2,
      d,
      'three',
      3,
      d
   ]);

it('makes duo', () => {
   const duo = sampleDuo();

   expect(duo.size()).toBe(3);
   expect(duo.item(1)).toEqual(['two', 2]);
});

it('allows items to be added to a duo', () => {
   const duo = sampleDuo();

   expect(duo.push('four', 4)).toBe(4);
   expect(duo.item(3)).toEqual(['four', 4]);
});

it('allows items to be popped from a duo', () => {
   const duo = sampleDuo();
   const [a, b] = duo.pop();

   expect(a).toBe('three');
   expect(b).toBe(3);
   expect(duo.size()).toBe(2);
});

it('returns index for either duo member', () => {
   const duo = sampleDuo();

   expect(duo.indexOf('four')).toBe(-1);
   expect(duo.indexOf('two')).toBe(1);
   expect(duo.indexOf(undefined, 2)).toBe(1);
});

it('finds duo member matching predicate', () => {
   const duo = sampleDuo();

   expect(duo.find((_, b) => b == 2)).toEqual(['two', 2]);
});

it('makes trio', () => {
   const now = new Date();
   const trio = sampleTrio(now);

   expect(trio.size()).toBe(3);
   expect(trio.item(1)).toEqual(['two', 2, now]);
});

it('allows items to be added to a trio', () => {
   const now = new Date();
   const trio = sampleTrio(now);

   expect(trio.push('four', 4, now)).toBe(4);
   expect(trio.item(3)).toEqual(['four', 4, now]);
});

it('allows items to be popped from a trio', () => {
   const now = new Date();
   const trio = sampleTrio(now);

   const [a, b, c] = trio.pop();

   expect(a).toBe('three');
   expect(b).toBe(3);
   expect(c).toBe(now);
});

it('returns index for any trio member', () => {
   const now = new Date();
   const trio = sampleTrio(now);

   expect(trio.indexOf('four')).toBe(-1);
   expect(trio.indexOf('two')).toBe(1);
   expect(trio.indexOf(undefined, 2)).toBe(1);
   expect(trio.indexOf(undefined, undefined, now)).toBe(0);
});

it('finds trio member matching predicate', () => {
   const now = new Date();
   const trio = sampleTrio(now);

   expect(trio.find((_, b) => b == 3)).toEqual(['three', 3, now]);
   expect(trio.find(a => a == 'one')).toEqual(['one', 1, now]);
});
