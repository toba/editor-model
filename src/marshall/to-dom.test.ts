import '@toba/test';
import { basicSchema } from '../schema/';
import { p, strong, em, code } from '../test-tools/mocks';
import { DOMSerializer } from './to-dom';

const serializer = DOMSerializer.fromSchema(basicSchema);
const noEm = new DOMSerializer(
   serializer.nodes,
   Object.assign({}, serializer.marks, { em: null })
);

it('can omit a mark', () => {
   expect(
      (noEm.serializeNode(p('foo', em('bar'), strong('baz')), {
         document
      }) as Element).innerHTML
   ).toBe('foobar<strong>baz</strong>');
});

it("doesn't split other marks for omitted marks", () => {
   expect(
      (noEm.serializeNode(
         p('foo', code('bar'), em(code('baz'), 'quux'), 'xyz'),
         { document }
      ) as Element).innerHTML
   ).toBe('foo<code>barbaz</code>quuxxyz');
});

it('can render marks with complex structure', () => {
   let deepEm = new DOMSerializer(
      serializer.nodes,
      Object.assign({}, serializer.marks, {
         em: () => ['em', ['i', { 'data-emphasis': true }, 0]]
      })
   );
   expect(
      (deepEm.serializeNode(
         p(strong('foo', code('bar'), em(code('baz'))), em('quux'), 'xyz'),
         { document }
      ) as Element).innerHTML
   ).toBe(
      '<strong>foo<code>bar</code></strong><em><i data-emphasis="true"><strong><code>baz</code></strong>quux</i></em>xyz'
   );
});
