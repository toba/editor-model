import '@toba/test';
import { compare, expectSame } from '../test-tools';

describe('duplicate ProseMirror functionality', () => {
   it('retrieves same ancestor node', () => {
      const [testDoc, pm_testDoc] = compare.textDoc('foobar');

      [2, 3].forEach(p => {
         const pos = testDoc.resolve(p);
         const pm_pos = pm_testDoc.resolve(p);

         expectSame.position(pos, pm_pos);

         const anc = pos.node(2);
         const pm_anc = pm_pos.node(2);

         expectSame.node(anc, pm_anc);
      });
   });
});
