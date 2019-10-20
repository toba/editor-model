import '@toba/test';
import { basicSchema, SchemaTag as tag } from './basic';
import { makeTestItems, NodeMaker, pm } from '../test-tools';

const items = makeTestItems(basicSchema, {
   p: { type: tag.Paragraph },
   hr: { type: tag.Line }
});

const doc = items.node['doc'];
const p = items.node['p'];
const hr = items.node['hr'];

describe('duplicate ProseMirror functionality', () => {
   it('creates the same makers from schema', () => {
      const makers = makeTestItems(basicSchema);
      const pm_makers = pm.mock.builders(basicSchema);

      expect(pm_makers).toBeDefined();
   });

   it('creates the same nodes makers', () => {
      new Map<NodeMaker, any>([
         [doc, pm.mock.doc],
         [p, pm.mock.p],
         [hr, pm.mock.hr]
      ]).forEach((pm, me) => {
         expect(me.name).toBe(pm.name);
         expect(me.length).toBe(pm.length);
      });
   });
});
