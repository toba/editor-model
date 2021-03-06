import '@toba/test';
import { SchemaTag as tag } from '../schema/';
import { typeSequence, compare } from '../test-tools';

describe('duplicate ProseMirror functionality', () => {
   function expectSameExpression(pattern: string) {
      const [expr, pm_expr] = compare.expressions(pattern);

      expect(expr.type).toBe(pm_expr.type);
      expect(expr.exprs!.length).toBe(pm_expr.exprs.length);

      for (let i = 0; i < expr.exprs!.length; i++) {
         const ex = expr.exprs![i];
         const pm_ex = pm_expr.exprs[i];

         expect(ex.type).toBe(pm_ex.type);

         if (ex.value === undefined) {
            expect(pm_ex.value).toBeUndefined();
         } else {
            expect(ex.value.name).toBe(pm_ex.value.name);
         }
      }
   }

   it('creates same token streams', () => {
      const [stream, pm_stream] = compare.streams();

      expect(stream.pattern).toBe(pm_stream.string);
      expect(stream.tokens).toEqual(pm_stream.tokens);
   });

   it('parses basic expressions the same', () => {
      expectSameExpression(
         typeSequence(tag.Paragraph, tag.Line, tag.Paragraph)
      );
   });

   it('parses optional expressions the same', () => {
      expectSameExpression(`${tag.Heading} ${tag.Paragraph}? ${tag.Line}`);
   });
});
