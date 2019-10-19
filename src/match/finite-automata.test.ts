import '@toba/test';
import { Edge, nfaToDFA, nullFrom } from './finite-automata';
import { ContentMatch } from './match';
import { typeSequence, Item, compare, pm } from '../test/';

describe('duplicate ProseMirror functionality', () => {
   function expectSameNFA(pattern: string) {
      const [nfa, pm_nfa] = compare.nfa(pattern);

      expect(nfa.length).toBe(pm_nfa.length);

      for (let i = 0; i < nfa.length; i++) {
         const edges: Edge[] = nfa[i];
         const pm_edges: any[] = pm_nfa[i];

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

      return [nfa, pm_nfa];
   }

   it('creates basic finite automata', () => {
      expectSameNFA(typeSequence(Item.Paragraph, Item.Line, Item.Paragraph));
   });

   it('creates NFA with options', () => {
      expectSameNFA('heading paragraph? horizontal_rule');
   });

   it('finds nodes reachable by null edges', () => {
      const [auto, pm_auto] = compare.nfa();

      for (let i = 0; i < 3; i++) {
         const from = nullFrom(auto, i);
         const pm_from = pm.nullFrom(pm_auto, i);

         expect(from.length).toBe(pm_from.length);
         expect(from).toEqual(pm_from);
      }
   });

   it('creates basic pattern matches', () => {
      const [nfa, pm_nfa] = compare.nfa();
      const match: ContentMatch = nfaToDFA(nfa);
      const pm_match: any = pm.nfaToDFA(pm_nfa);

      expect(match.edgeCount).toBe(pm_match.edgeCount);
      expect(match.defaultType!.name).toBe(pm_match.defaultType.name);
   });

   it('creates optional pattern matches', () => {
      const [nfa, pm_nfa] = expectSameNFA('heading paragraph? horizontal_rule');
      const match: ContentMatch = nfaToDFA(nfa);
      const pm_match: any = pm.nfaToDFA(pm_nfa);

      compare.expectSameMatch(match, pm_match);
   });
});
