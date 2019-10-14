import '@toba/test';
import { Edge, nfaToDFA, nullFrom } from './finite-automata';
import {
   dfa as pm_nfaToDFA,
   nullFrom as pm_nullFrom
} from '@toba/test-prosemirror-model';
import { makeNFA } from './__mocks__/compare';
import { ContentMatch } from './match';

describe('duplicate ProseMirror functionality', () => {
   it('creates finite automata the same', () => {
      const [auto, pm_auto] = makeNFA();

      expect(auto.length).toBe(pm_auto.length);

      for (let i = 0; i < auto.length; i++) {
         const edges: Edge[] = auto[i];
         const pm_edges: any[] = pm_auto[i];

         expect(edges.length).toBe(pm_edges.length);

         for (let j = 0; j < edges.length; j++) {
            const e: Edge = edges[j];
            const pm_e: any = pm_edges[j];

            expect(e.to).toBe(pm_e.to);

            if (e.term !== undefined) {
               expect(e.term.name).toBe(pm_e.term.name);
            } else {
               expect(pm_e.term).toBeUndefined();
            }
         }
      }
   });

   it('finds same nodes reachable by null edges', () => {
      const [auto, pm_auto] = makeNFA();

      for (let i = 0; i < 3; i++) {
         const from = nullFrom(auto, i);
         const pm_from = pm_nullFrom(pm_auto, i);

         expect(from.length).toBe(pm_from.length);
         expect(from).toEqual(pm_from);
      }
   });

   it('creates match the same', () => {
      const [auto, pm_auto] = makeNFA();
      const match: ContentMatch = nfaToDFA(auto);
      const pm_match: any = pm_nfaToDFA(pm_auto);

      expect(match.edgeCount).toBe(pm_match.edgeCount);
      expect(match.defaultType).toBe(pm_match.defaultType);
   });
});
