import '@toba/test';
import { makeStreams, makeExpressions } from './__mocks__/compare';

describe('duplicate ProseMirror functionality', () => {
   it('creates same token streams', () => {
      const [stream, pm_stream] = makeStreams();

      expect(stream.pattern).toBe(pm_stream.string);
      expect(stream.tokens).toEqual(pm_stream.tokens);
   });

   it('parses expressions the same', () => {
      const [expr, pm_expr] = makeExpressions();

      expect(expr.type).toBe(pm_expr.type);
      expect(expr.exprs!.length).toBe(pm_expr.exprs.length);

      for (let i = 0; i < expr.exprs!.length; i++) {
         const ex = expr.exprs![i];
         const pm_ex = pm_expr.exprs[i];

         expect(ex.type).toBe(pm_ex.type);
         expect(ex.value!.name).toBe(pm_ex.value.name);
      }
      expect(pm_expr).toBeDefined();
   });
});
