import '@toba/test';
import { compare, expectSame } from '../test/';

describe('duplicate ProseMirror functionality', () => {
   it('adds elements with rules', () => {
      const [context, pm_context] = compare.parseContext();
      const ol = document.createElement('ol');

      context.addElement(ol);
      pm_context.addElement(ol);

      expectSame.parseContext(context, pm_context);
   });

   it.skip('adds DOM Element', () => {
      const [context, pm_context] = compare.parseContext();
      const div = document.createElement('div');

      div.innerHTML = '<ol><p>Oh no</p></ol>';

      context.addElement(div);
      pm_context.addElement(div);

      expectSame.parseContext(context, pm_context);
   });

   it.skip('adds content of a DOM node', () => {
      const [context, pm_context] = compare.parseContext();
      const div = document.createElement('div');
      const pm_div = document.createElement('div');

      div.innerHTML = '<ol><p>Oh no</p></ol>';

      expectSame.parseContext(context, pm_context);

      context.addAll(div);
      pm_context.addAll(pm_div);

      expectSame.parseContext(context, pm_context);
   });

   it.skip('fills in missing stuff', () => {
      const [context, pm_context] = compare.parseContext(
         '<ol><p>Oh no</p></ol>'
      );

      expectSame.parseContext(context, pm_context);
   });
});
