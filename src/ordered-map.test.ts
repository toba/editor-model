import '@toba/test';
import { OrderedMap } from './ordered-map';

const numberMap = () =>
   new OrderedMap<number>([['one', 1], ['two', 2], ['three', 3]]);

it('constructs map from arrays', () => {
   const map = numberMap();
   expect(map.size).toBe(3);
   expect(map.get('one')).toBe(1);
});

it('allows values to be retrieved by key', () => {
   const map = numberMap();
   expect(map.get('three')).toBe(3);
   expect(map.get('five')).toBeUndefined();
});

it('indicates whether a key exists', () => {
   const map = numberMap();
   expect(map.has('two')).toBe(true);
   expect(map.has('ten')).toBe(false);
});

it('allows items to be removed', () => {
   const map = numberMap();
   map.remove('two');

   expect(map.has('two')).toBe(false);
   expect(map.size).toBe(2);
});

it('allows items to be added at beginning or end', () => {
   let map = numberMap();
   expect(map.find('one')).toBe(0);

   map = map.addToStart('zero', 0);
   expect(map.find('one')).toBe(1);
   expect(map.get('zero')).toBe(0);

   map = map.addToEnd('four', 4);
   expect(map.find('one')).toBe(1);
   expect(map.get('four')).toBe(4);
   expect(map.find('four')).toBe(4);
});
