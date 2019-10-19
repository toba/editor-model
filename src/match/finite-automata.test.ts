import '@toba/test';
import { nfaToDFA, nullFrom } from './finite-automata';
import { ContentMatch } from './match';
import { SchemaTag as tag } from '../schema';
import { typeSequence, compare, pm, expectSame } from '../test-tools';

describe('duplicate ProseMirror functionality', () => {
   it('creates basic finite automata', () => {
      expectSame.NFA(typeSequence(tag.Paragraph, tag.Line, tag.Paragraph));
   });

   it('creates NFA with options', () => {
      expectSame.NFA('heading paragraph? horizontal_rule');
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
      const [nfa, pm_nfa] = expectSame.NFA(
         'heading paragraph? horizontal_rule'
      );
      const match: ContentMatch = nfaToDFA(nfa);
      const pm_match: any = pm.nfaToDFA(pm_nfa);

      expectSame.match(match, pm_match);
   });
});
