import { StepMap } from './step-map';
import { Mapping } from './mapping';

/** `from`, `to`, `bias` and `lossy` flag */
type Case = [number, number, number?, boolean?];

function testMapping(mapping: Mapping, ...cases: Case[]) {
   let inverted = mapping.invert();

   for (let i = 0; i < cases.length; i++) {
      const [from, to, bias = 1, lossy = false] = cases[i];

      expect(mapping.map(from, bias)).toBe(to);

      if (!lossy) {
         expect(inverted.map(to, bias)).toBe(from);
      }
   }
}

function mk(...args: (number[] | { [key: number]: number })[]): Mapping {
   const mapping = new Mapping();

   args.forEach(arg => {
      if (Array.isArray(arg)) {
         mapping.appendMap(new StepMap(arg));
      } else {
         let from: any;
         for (from in arg) {
            mapping.setMirror(from, arg[from]);
         }
      }
   });
   return mapping;
}

it('can map through a single insertion', () => {
   testMapping(mk([2, 0, 4]), [0, 0], [2, 6], [2, 2, -1], [3, 7]);
});

it('can map through a single deletion', () => {
   testMapping(
      mk([2, 4, 0]),
      [0, 0],
      [2, 2, -1],
      [3, 2, 1, true],
      [6, 2, 1],
      [6, 2, -1, true],
      [7, 3]
   );
});

it('can map through a single replace', () => {
   testMapping(
      mk([2, 4, 4]),
      [0, 0],
      [2, 2, 1],
      [4, 6, 1, true],
      [4, 2, -1, true],
      [6, 6, -1],
      [8, 8]
   );
});

it('can map through a mirrorred delete-insert', () => {
   testMapping(
      mk([2, 4, 0], [2, 0, 4], { 0: 1 }),
      [0, 0],
      [2, 2],
      [4, 4],
      [6, 6],
      [7, 7]
   );
});

it('cap map through a mirrorred insert-delete', () => {
   testMapping(mk([2, 0, 4], [2, 4, 0], { 0: 1 }), [0, 0], [2, 2], [3, 3]);
});

it('can map through an delete-insert with an insert in between', () => {
   testMapping(
      mk([2, 4, 0], [1, 0, 1], [3, 0, 4], { 0: 2 }),
      [0, 0],
      [1, 2],
      [4, 5],
      [6, 7],
      [7, 8]
   );
});
