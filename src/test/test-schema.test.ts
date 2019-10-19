import '@toba/test';
import pm from '@toba/test-prosemirror-tester';
import { testSchema, Item } from './test-schema';
import { makeTestItems, NodeMaker } from './test-maker';

const items = makeTestItems(testSchema, {
   p: { type: Item.Paragraph },
   hr: { type: Item.Line }
});

const doc = items.node['doc'];
const p = items.node['p'];
const hr = items.node['hr'];

describe('duplicate ProseMirror functionality', () => {
   it('creates the same makers from schema', () => {
      const makers = makeTestItems(testSchema);
      const pm_makers = pm.builders(testSchema);

      expect(pm_makers).toBeDefined();
   });

   it('creates the same nodes makers', () => {
      new Map<NodeMaker, any>([[doc, pm.doc], [p, pm.p], [hr, pm.hr]]).forEach(
         (pm, me) => {
            expect(me.name).toBe(pm.name);
            expect(me.length).toBe(pm.length);
         }
      );
   });
});
