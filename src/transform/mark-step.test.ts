import '@toba/test';
import { doc, p, schema } from '../test-tools/mocks';
import { AddMarkStep, RemoveMarkStep } from './mark-step';
import { ReplaceStep } from './replace-step';
import { Slice } from '../node/slice';
import { Fragment } from '../node/fragment';
// const { Slice, Fragment } = require('prosemirror-model');
// const { ReplaceStep, AddMarkStep, RemoveMarkStep } = require('..');
// const ist = require('ist');
// const { eq, schema, doc, p } = require('prosemirror-test-builder');

const testDoc = doc(p('foobar'));

function makeStep(
   from: number,
   to: number,
   token: string | null
): AddMarkStep | RemoveMarkStep | ReplaceStep {
   if (token == '+em') {
      return new AddMarkStep(from, to, schema.marks.em.create());
   } else if (token == '-em') {
      return new RemoveMarkStep(from, to, schema.marks.em.create());
   } else {
      return new ReplaceStep(
         from,
         to,
         token == null
            ? Slice.empty
            : new Slice(Fragment.from(schema.text(token)), 0, 0)
      );
   }
}

const yes = (
   from1: number,
   to1: number,
   token1: string | null,
   from2: number,
   to2: number,
   token2: string | null
) => () => {
   const step1 = makeStep(from1, to1, token1);
   const step2 = makeStep(from2, to2, token2);
   const merged = step1.merge(step2 as any);

   expect(merged).toBeDefined();
   expect(merged!.apply(testDoc).doc!).toEqual(
      step2.apply(step1.apply(testDoc).doc!).doc
   );
};

const no = (
   from1: number,
   to1: number,
   token1: string | null,
   from2: number,
   to2: number,
   token2: string | null
) => () => {
   const step1 = makeStep(from1, to1, token1);
   const step2 = makeStep(from2, to2, token2);

   expect(step1.merge(step2 as any)).toBe(false);
};

it('merges typing changes', yes(2, 2, 'a', 3, 3, 'b'));

it('merges inverse typing', yes(2, 2, 'a', 2, 2, 'b'));

it("doesn't merge separated typing", no(2, 2, 'a', 4, 4, 'b'));

it("doesn't merge inverted separated typing", no(3, 3, 'a', 2, 2, 'b'));

it('merges adjacent backspaces', yes(3, 4, null, 2, 3, null));

it('merges adjacent deletes', yes(2, 3, null, 2, 3, null));

it("doesn't merge separate backspaces", no(1, 2, null, 2, 3, null));

it('merges backspace and type', yes(2, 3, null, 2, 2, 'x'));

it('merges longer adjacent inserts', yes(2, 2, 'quux', 6, 6, 'baz'));

it('merges inverted longer inserts', yes(2, 2, 'quux', 2, 2, 'baz'));

it('merges longer deletes', yes(2, 5, null, 2, 4, null));

it('merges inverted longer deletes', yes(4, 6, null, 2, 4, null));

it('merges overwrites', yes(3, 4, 'x', 4, 5, 'y'));

it('merges adding adjacent styles', yes(1, 2, '+em', 2, 4, '+em'));

it('merges adding overlapping styles', yes(1, 3, '+em', 2, 4, '+em'));

it("doesn't merge separate styles", no(1, 2, '+em', 3, 4, '+em'));

it('merges removing adjacent styles', yes(1, 2, '-em', 2, 4, '-em'));

it('merges removing overlapping styles', yes(1, 3, '-em', 2, 4, '-em'));

it("doesn't merge removing separate styles", no(1, 2, '-em', 3, 4, '-em'));
