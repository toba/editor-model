const {
   doc,
   blockquote,
   h1,
   h2,
   p,
   em,
   strong
} = require('prosemirror-test-builder');
const ist = require('ist');

describe('Fragment', () => {
   describe('findDiffStart', () => {
      function start(a, b) {
         ist(a.content.findDiffStart(b.content), a.tag.a);
      }
   });

   describe('findDiffEnd', () => {
      function end(a, b) {
         let found = a.content.findDiffEnd(b.content);
         ist(found && found.a, a.tag.a);
      }

      it('returns null when there is no difference', () =>
         end(
            doc(p('a', em('b')), p('hello'), blockquote(h1('bye'))),
            doc(p('a', em('b')), p('hello'), blockquote(h1('bye')))
         ));

      it('notices when the second doc is longer', () =>
         end(
            doc('<a>', p('a', em('b')), p('hello'), blockquote(h1('bye'))),
            doc(p('oops'), p('a', em('b')), p('hello'), blockquote(h1('bye')))
         ));

      it('notices when the second doc is shorter', () =>
         end(
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
         end(doc(p('a', em('b'), '<a>c')), doc(p('a', strong('b'), 'c'))));

      it('spots longer text', () =>
         end(doc(p('bar<a>foo', em('b'))), doc(p('foo', em('b')))));

      it('spots different text', () =>
         end(doc(p('foob<a>ar')), doc(p('foocar'))));

      it('notices different nodes', () =>
         end(doc(p('a'), '<a>', p('b')), doc(h1('a'), p('b'))));

      it('notices a difference at the end', () =>
         end(doc(p('b'), '<a>'), doc(h1('b'))));

      it('handles a similar start', () =>
         end(doc('<a>', p('hello')), doc(p('hey'), p('hello'))));
   });
});
