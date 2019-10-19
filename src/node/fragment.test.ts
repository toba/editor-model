import '@toba/test';
import { doc, p, h1, h2, strong, em, blockquote } from '../test/mocks';
import { TestNode } from '../test/test-maker';

describe('findDiffStart', () => {
   function expectStart(a: TestNode, b: TestNode) {
      expect(a.tag).toBeDefined();
      expect(a.content.findDiffStart(b.content)).toBe(a.tag!['a']);
   }

   it('returns undefined for identical nodes', () =>
      expectStart(
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye'))),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices when one node is longer', () =>
      expectStart(
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')), '<a>'),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')), p('oops'))
      ));

   it('notices when one node is shorter', () =>
      expectStart(
         doc(
            p('a', em('b')),
            p('hello'),
            blockquote(h1('bye')),
            '<a>',
            p('oops')
         ),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices differing marks', () =>
      expectStart(doc(p('a<a>', em('b'))), doc(p('a', strong('b')))));

   it('stops at longer text', () =>
      expectStart(doc(p('foo<a>bar', em('b'))), doc(p('foo', em('b')))));

   it('stops at a different character', () =>
      expectStart(doc(p('foo<a>bar')), doc(p('foocar'))));

   it('stops at a different node type', () =>
      expectStart(doc(p('a'), '<a>', p('b')), doc(p('a'), h1('b'))));

   it('works when the difference is at the start', () =>
      expectStart(doc('<a>', p('b')), doc(h1('b'))));

   it('notices a different attribute', () =>
      expectStart(doc(p('a'), '<a>', h1('foo')), doc(p('a'), h2('foo'))));
});

describe('findDiffEnd', () => {
   function exectEnd(a: TestNode, b: TestNode) {
      const found = a.content.findDiffEnd(b.content);
      expect(a.tag).toBeDefined();

      if (found === undefined) {
         expect(a.tag!['a']).toBeUndefined();
      } else {
         expect(found.a).toBe(a.tag!['a']);
      }
   }

   it('returns undefined when there is no difference', () =>
      exectEnd(
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye'))),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices when the second doc is longer', () =>
      exectEnd(
         doc('<a>', p('a', em('b')), p('hello'), blockquote(h1('bye'))),
         doc(p('oops'), p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices when the second doc is shorter', () =>
      exectEnd(
         doc(
            p('oops'),
            '<a>',
            p('a', em('b')),
            p('hello'),
            blockquote(h1('bye'))
         ),
         doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
      ));

   it('notices different styles', () =>
      exectEnd(doc(p('a', em('b'), '<a>c')), doc(p('a', strong('b'), 'c'))));

   it('spots longer text', () =>
      exectEnd(doc(p('bar<a>foo', em('b'))), doc(p('foo', em('b')))));

   it('spots different text', () =>
      exectEnd(doc(p('foob<a>ar')), doc(p('foocar'))));

   it('notices different nodes', () =>
      exectEnd(doc(p('a'), '<a>', p('b')), doc(h1('a'), p('b'))));

   it('notices a difference at the end', () =>
      exectEnd(doc(p('b'), '<a>'), doc(h1('b'))));

   it('handles a similar start', () =>
      exectEnd(doc('<a>', p('hello')), doc(p('hey'), p('hello'))));
});
