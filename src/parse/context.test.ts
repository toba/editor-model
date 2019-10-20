import '@toba/test';
import { compare, expectSame } from '../test-tools/index';

describe('duplicate ProseMirror functionality', () => {
   it('finds missing wrapping tags', () => {
      const [context, pm_context] = compare.parseContext(
         '<ol><p>Oh no</p></ol>'
      );

      expectSame.parseContext(context, pm_context);
   });

   it('handles extra tab characters', () => {
      const [context, pm_context] = compare.parseContext(
         '<p> <b>&#09;</b></p>'
      );

      expectSame.parseContext(context, pm_context);
   });
});
