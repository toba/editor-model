import '@toba/test';
import { is } from '@toba/tools';
import { ContentMatch as pm_ContentMatch } from '@toba/test-prosemirror-model';
import pm, { testSchema as pm_testSchema } from '@toba/test-prosemirror-tester';
import { ContentMatch } from './match';
import { doc, p, hr } from './__mocks__';
import { testSchema, TestTypeName, typeSequence } from './test-schema';
import { NodeType } from './node-type';
import { EditorNode } from './node';
import { Fragment } from './fragment';
import { TestNode } from './test-maker';

/**
 * Match nodes in the test schema.
 */
const matchNodes = (pattern: string): ContentMatch =>
   ContentMatch.parse(pattern, testSchema.nodes);

// https://github.com/ProseMirror/prosemirror-model/blob/master/test/test-content.js

describe('matchType', () => {
   /**
    * @param typeNames Space-delimited `NodeType` names
    */
   function match(pattern: string, typeNames?: string): boolean {
      const types: NodeType[] = is.empty(typeNames)
         ? []
         : typeNames.split(' ').map(t => testSchema.nodes[t]);

      let m: ContentMatch | undefined = matchNodes(pattern);

      for (let i = 0; m !== undefined && i < types.length; i++) {
         m = m.matchType(types[i]);
      }
      return m !== undefined && m.validEnd;
   }

   /**
    * Expect pattern to match node types within test schema.
    * @param typeNames Space-delimited `NodeType` names
    */
   function expectMatch(pattern: string, typeNames: string) {
      expect(match(pattern, typeNames)).toBe(true);
   }

   /**
    * Expect pattern _not_ to match node types within test schema.
    * @param typeNames Space-delimited `NodeType` names
    */
   function expectMismatch(pattern: string, typeNames: string) {
      expect(match(pattern, typeNames)).toBe(false);
   }

   it('accepts empty content for the empty expr', () => expectMatch('', ''));
   it("doesn't accept content in the empty expr", () =>
      expectMismatch('', TestTypeName.Image));
   it('matches nothing to an asterisk', () => expectMatch('image*', ''));
   it('matches one element to an asterisk', () =>
      expectMatch('image*', TestTypeName.Image));
   it('matches multiple elements to an asterisk', () =>
      expectMatch('image*', 'image image image image'));
   it('only matches appropriate elements to an asterisk', () =>
      expectMismatch('image*', 'image text'));

   it('matches group members to a group', () =>
      expectMatch('inline*', 'image text'));
   it("doesn't match non-members to a group", () =>
      expectMismatch('inline*', TestTypeName.Paragraph));
   it('matches an element to a choice expression', () =>
      expectMatch('(paragraph | heading)', TestTypeName.Paragraph));
   it("doesn't match unmentioned elements to a choice expr", () =>
      expectMismatch(`(paragraph | heading)`, TestTypeName.Image));

   it('matches a simple sequence', () => {
      const seq = typeSequence(
         TestTypeName.Paragraph,
         TestTypeName.Line,
         TestTypeName.Paragraph
      );
      expectMatch(seq, seq);
   });
   it('fails when a sequence is too long', () =>
      expectMismatch(
         'paragraph horizontal_rule',
         'paragraph horizontal_rule paragraph'
      ));
   it('fails when a sequence is too short', () =>
      expectMismatch(
         'paragraph horizontal_rule paragraph',
         typeSequence(TestTypeName.Paragraph, TestTypeName.Line)
      ));
   it('fails when a sequence starts incorrectly', () =>
      expectMismatch(
         'paragraph horizontal_rule',
         'horizontal_rule paragraph horizontal_rule'
      ));

   it('accepts a sequence asterisk matching zero elements', () =>
      expectMatch('heading paragraph*', TestTypeName.Heading));
   it('accepts a sequence asterisk matching multiple elts', () =>
      expectMatch(
         'heading paragraph*',
         typeSequence(
            TestTypeName.Heading,
            TestTypeName.Paragraph,
            TestTypeName.Paragraph
         )
      ));
   it('accepts a sequence plus matching one element', () =>
      expectMatch(
         'heading paragraph+',
         typeSequence(TestTypeName.Heading, TestTypeName.Paragraph)
      ));
   it('accepts a sequence plus matching multiple elts', () =>
      expectMatch(
         'heading paragraph+',
         typeSequence(
            TestTypeName.Heading,
            TestTypeName.Paragraph,
            TestTypeName.Paragraph
         )
      ));
   it('fails when a sequence plus has no elements', () =>
      expectMismatch('heading paragraph+', TestTypeName.Heading));
   it('fails when a sequence plus misses its start', () =>
      expectMismatch(
         'heading paragraph+',
         typeSequence(TestTypeName.Paragraph, TestTypeName.Paragraph)
      ));

   it('accepts an optional element being present', () =>
      expectMatch('image?', TestTypeName.Image));
   it('accepts an optional element being missing', () =>
      expectMatch('image?', ''));
   it('fails when an optional element is present twice', () =>
      expectMismatch(
         'image?',
         typeSequence(TestTypeName.Image, TestTypeName.Image)
      ));

   it('accepts a nested repeat', () =>
      expectMatch(
         '(heading paragraph+)+',
         'heading paragraph heading paragraph paragraph'
      ));
   it('fails on extra input after a nested repeat', () =>
      expectMismatch(
         '(heading paragraph+)+',
         'heading paragraph heading paragraph paragraph horizontal_rule'
      ));

   it('accepts a matching count', () =>
      expectMatch(
         'hard_break{2}',
         typeSequence(TestTypeName.Break, TestTypeName.Break)
      ));
   it('rejects a count that comes up short', () =>
      expectMismatch('hard_break{2}', TestTypeName.Break));
   it('rejects a count that has too many elements', () =>
      expectMismatch('hard_break{2}', 'hard_break hard_break hard_break'));
   it('accepts a count on the lower bound', () =>
      expectMatch(
         'hard_break{2, 4}',
         typeSequence(TestTypeName.Break, TestTypeName.Break)
      ));
   it('accepts a count on the upper bound', () =>
      expectMatch(
         'hard_break{2, 4}',
         'hard_break hard_break hard_break hard_break'
      ));
   it('accepts a count between the bounds', () =>
      expectMatch(
         'hard_break{2, 4}',
         typeSequence(
            TestTypeName.Break,
            TestTypeName.Break,
            TestTypeName.Break
         )
      ));
   it('rejects a sequence with too few elements', () =>
      expectMismatch('hard_break{2, 4}', TestTypeName.Break));
   it('rejects a sequence with too many elements', () =>
      expectMismatch(
         'hard_break{2, 4}',
         'hard_break hard_break hard_break hard_break hard_break'
      ));
   it('rejects a sequence with a bad element after it', () =>
      expectMismatch('hard_break{2, 4} text*', 'hard_break hard_break image'));
   it('accepts a sequence with a matching element after it', () =>
      expectMatch(
         'hard_break{2, 4} image?',
         typeSequence(
            TestTypeName.Break,
            TestTypeName.Break,
            TestTypeName.Image
         )
      ));
   it('accepts an open range', () =>
      expectMatch(
         'hard_break{2,}',
         typeSequence(TestTypeName.Break, TestTypeName.Break)
      ));
   it('accepts an open range matching many', () =>
      expectMatch(
         'hard_break{2,}',
         'hard_break hard_break hard_break hard_break'
      ));
   it('rejects an open range with too few elements', () =>
      expectMismatch('hard_break{2,}', TestTypeName.Break));
});

describe('duplicate ProseMirror functionality', () => {
   function makeParseMatch(
      pattern = typeSequence(
         TestTypeName.Paragraph,
         TestTypeName.Line,
         TestTypeName.Paragraph
      )
   ): [ContentMatch | undefined, any] {
      const match: ContentMatch | undefined = ContentMatch.parse(
         pattern,
         testSchema.nodes
      );
      const pm_match = pm_ContentMatch.parse(pattern, pm_testSchema.nodes);

      return [match, pm_match];
   }

   function makeFragMatch(
      node: TestNode,
      pm_node: any,
      pattern?: string
   ): [ContentMatch | undefined, any] {
      const [match, pm_match] = makeParseMatch(pattern);
      const fragMatch = match!.matchFragment(node.content);
      const pm_fragMatch = pm_match.matchFragment(pm_node.content);

      return [fragMatch, pm_fragMatch];
   }

   function expectSameMatch(
      match: ContentMatch | undefined,
      pm_match: any
   ): void {
      expect(match).toBeDefined();
      if (match!.defaultType) {
         expect(match!.defaultType!.name).toBe(pm_match.defaultType.name);
      } else {
         expect(pm_match.defaultType).toBeUndefined();
      }

      expect(match!.edgeCount).toBe(pm_match.edgeCount);
      expect(match!.validEnd).toBe(pm_match.validEnd);
   }

   it('parses pattern the same', () => {
      const [match, pm_match] = makeParseMatch();
      expectSameMatch(match, pm_match);
   });

   it('matches fragment the same', () => {
      const [match, pm_match] = makeFragMatch(doc(p()), pm.doc(pm.p()));
      expectSameMatch(match, pm_match);
   });

   it('fills-before the same', () => {
      const after = doc(p());
      const pm_after = pm.doc(pm.p());
      const [match, pm_match] = makeFragMatch(
         doc(p()),
         pm.doc(pm.p()),
         typeSequence(
            TestTypeName.Paragraph,
            TestTypeName.Line,
            TestTypeName.Paragraph
         )
      );
      const filled = match!.fillBefore(after.content, true);
      const pm_filled = pm_match.fillBefore(pm_after.content, true);

      expect(filled).toBeDefined();
      expect(pm_filled).toBeDefined();
      expect(filled!.size).toBe(pm_filled.size);
   });
});

describe('fillBefore', () => {
   function expectFillResult(
      pattern: string,
      before: EditorNode,
      after: EditorNode,
      result?: EditorNode
   ) {
      const m: ContentMatch | undefined = matchNodes(pattern).matchFragment(
         before.content
      );
      const filled: Fragment | undefined =
         m !== undefined ? m.fillBefore(after.content, true) : Fragment.empty;

      if (result !== undefined) {
         expect(filled).toEqual(result.content);
      } else {
         expect(filled).toBeUndefined();
      }
   }

   function fill3(
      expr: string,
      before: EditorNode,
      mid: EditorNode,
      after: EditorNode,
      left?: EditorNode,
      right?: EditorNode
   ) {
      const m = matchNodes(expr);
      const aMatch = m.matchFragment(before.content);

      let a: Fragment | undefined;
      let b: Fragment | undefined;

      if (aMatch !== undefined) {
         a = aMatch.fillBefore(mid.content);
      }

      if (a !== undefined) {
         const bMatch = m.matchFragment(
            before.content.append(a).append(mid.content)
         );
         if (bMatch !== undefined) {
            b = bMatch.fillBefore(after.content, true);
         }
      }

      if (left !== undefined && right !== undefined) {
         expect(a).toEqual(left.content);
         expect(b).toEqual(right.content);
      } else {
         expect(b).not.toBeDefined();
      }
   }
   it('returns the empty fragment when things match', () =>
      expectFillResult(
         typeSequence(
            TestTypeName.Paragraph,
            TestTypeName.Line,
            TestTypeName.Paragraph
         ),
         doc(p(), hr),
         doc(p()),
         doc()
      ));

   it.skip('adds a node when necessary', () =>
      expectFillResult(
         typeSequence(
            TestTypeName.Paragraph,
            TestTypeName.Line,
            TestTypeName.Paragraph
         ),
         doc(p()),
         doc(p()),
         doc(hr)
      ));
});
