import '@toba/test';
import { is } from '@toba/tools';
import { ContentMatch as pm_ContentMatch } from '@toba/test-prosemirror-model';
import pm, { testSchema as pm_testSchema } from '@toba/test-prosemirror-tester';
import { ContentMatch } from './match';
import { doc, p, hr, br, img, h1, pre, expectSameMatch } from './__mocks__';
import {
   testSchema,
   Item,
   typeSequence,
   repeatType,
   Group
} from './test-schema';
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
      expectMismatch('', Item.Image));

   it('matches nothing to an asterisk', () =>
      expectMatch(`${Item.Image}*`, ''));

   it('matches one element to an asterisk', () =>
      expectMatch(`${Item.Image}*`, Item.Image));

   it('matches multiple elements to an asterisk', () =>
      expectMatch(`${Item.Image}*`, repeatType(4, Item.Image)));

   it('only matches appropriate elements to an asterisk', () =>
      expectMismatch(`${Item.Image}*`, typeSequence(Item.Image, Item.Text)));

   it('matches group members to a group', () =>
      expectMatch(`${Group.Inline}*`, typeSequence(Item.Image, Item.Text)));

   it("doesn't match non-members to a group", () =>
      expectMismatch(`${Group.Inline}*`, Item.Paragraph));

   it('matches an element to a choice expression', () =>
      expectMatch('(paragraph | heading)', Item.Paragraph));

   it("doesn't match unmentioned elements to a choice expr", () =>
      expectMismatch(`(paragraph | heading)`, Item.Image));

   it('matches a simple sequence', () => {
      const seq = typeSequence(Item.Paragraph, Item.Line, Item.Paragraph);
      expectMatch(seq, seq);
   });

   it('fails when a sequence is too long', () =>
      expectMismatch(
         typeSequence(Item.Paragraph, Item.Line),
         typeSequence(Item.Paragraph, Item.Line, Item.Paragraph)
      ));

   it('fails when a sequence is too short', () =>
      expectMismatch(
         typeSequence(Item.Paragraph, Item.Line, Item.Paragraph),
         typeSequence(Item.Paragraph, Item.Line)
      ));

   it('fails when a sequence starts incorrectly', () =>
      expectMismatch(
         typeSequence(Item.Paragraph, Item.Line),
         typeSequence(Item.Line, Item.Paragraph, Item.Line)
      ));

   it('accepts a sequence asterisk matching zero elements', () =>
      expectMatch('heading paragraph*', Item.Heading));

   it('accepts a sequence asterisk matching multiple elts', () =>
      expectMatch(
         'heading paragraph*',
         typeSequence(Item.Heading, Item.Paragraph, Item.Paragraph)
      ));

   it('accepts a sequence plus matching one element', () =>
      expectMatch(
         'heading paragraph+',
         typeSequence(Item.Heading, Item.Paragraph)
      ));

   it('accepts a sequence plus matching multiple elts', () =>
      expectMatch(
         'heading paragraph+',
         typeSequence(Item.Heading, Item.Paragraph, Item.Paragraph)
      ));

   it('fails when a sequence plus has no elements', () =>
      expectMismatch('heading paragraph+', Item.Heading));

   it('fails when a sequence plus misses its start', () =>
      expectMismatch(
         'heading paragraph+',
         typeSequence(Item.Paragraph, Item.Paragraph)
      ));

   it('accepts an optional element being present', () =>
      expectMatch(`${Item.Image}?`, Item.Image));

   it('accepts an optional element being missing', () =>
      expectMatch(`${Item.Image}?`, ''));

   it('fails when an optional element is present twice', () =>
      expectMismatch(`${Item.Image}?`, typeSequence(Item.Image, Item.Image)));

   it('accepts a nested repeat', () =>
      expectMatch(
         '(heading paragraph+)+',
         typeSequence(
            Item.Heading,
            Item.Paragraph,
            Item.Heading,
            Item.Paragraph,
            Item.Paragraph
         )
      ));
   it('fails on extra input after a nested repeat', () =>
      expectMismatch(
         '(heading paragraph+)+',
         typeSequence(
            Item.Heading,
            Item.Paragraph,
            Item.Heading,
            Item.Paragraph,
            Item.Paragraph,
            Item.Line
         )
      ));

   it('accepts a matching count', () =>
      expectMatch(`${Item.Break}{2}`, repeatType(2, Item.Break)));

   it('rejects a count that comes up short', () =>
      expectMismatch('hard_break{2}', Item.Break));

   it('rejects a count that has too many elements', () =>
      expectMismatch('hard_break{2}', repeatType(3, Item.Break)));

   it('accepts a count on the lower bound', () =>
      expectMatch('hard_break{2, 4}', repeatType(2, Item.Break)));

   it('accepts a count on the upper bound', () =>
      expectMatch('hard_break{2, 4}', repeatType(4, Item.Break)));

   it('accepts a count between the bounds', () =>
      expectMatch('hard_break{2, 4}', repeatType(3, Item.Break)));

   it('rejects a sequence with too few elements', () =>
      expectMismatch('hard_break{2, 4}', Item.Break));

   it('rejects a sequence with too many elements', () =>
      expectMismatch('hard_break{2, 4}', repeatType(5, Item.Break)));

   it('rejects a sequence with a bad element after it', () =>
      expectMismatch(
         'hard_break{2, 4} text*',
         typeSequence(Item.Break, Item.Break, Item.Image)
      ));

   it('accepts a sequence with a matching element after it', () =>
      expectMatch(
         'hard_break{2, 4} image?',
         typeSequence(Item.Break, Item.Break, Item.Image)
      ));

   it('accepts an open range', () =>
      expectMatch('hard_break{2,}', repeatType(2, Item.Break)));

   it('accepts an open range matching many', () =>
      expectMatch('hard_break{2,}', repeatType(4, Item.Break)));

   it('rejects an open range with too few elements', () =>
      expectMismatch('hard_break{2,}', Item.Break));
});

describe('duplicate ProseMirror functionality', () => {
   /**
    * Created a parsed `Match` for Toba and ProseMirror.
    */
   function makeParseMatch(
      pattern = typeSequence(Item.Paragraph, Item.Line, Item.Paragraph)
   ): [ContentMatch | undefined, any] {
      const match: ContentMatch | undefined = ContentMatch.parse(
         pattern,
         testSchema.nodes
      );
      const pm_match = pm_ContentMatch.parse(pattern, pm_testSchema.nodes);

      return [match, pm_match];
   }

   function makeFragMatch(
      node: TestNode = doc(p()),
      pm_node: any = pm.doc(pm.p()),
      pattern?: string
   ): [ContentMatch | undefined, any] {
      const [match, pm_match] = makeParseMatch(pattern);
      const fragMatch = match!.matchFragment(node.content);
      const pm_fragMatch = pm_match.matchFragment(pm_node.content);

      return [fragMatch, pm_fragMatch];
   }

   it('parses pattern the same', () => {
      const [match, pm_match] = makeParseMatch();
      expectSameMatch(match, pm_match);
   });

   it('parses optional pattern the same', () => {
      // const [match, pm_match] = makeFragMatch(
      //    doc(h1()),
      //    pm.doc(pm.h1()),
      //    'heading paragraph? horizontal_rule'
      // );
      const [match, pm_match] = makeParseMatch(
         'heading paragraph? horizontal_rule'
      );
      expectSameMatch(match, pm_match);
      //doc(h1()), doc()).toBe(doc(hr)

      //const patternMatch = matchNodes(pattern);
      //const beforeMatch = patternMatch.matchFragment(before.content);
   });

   it('matches fragment the same', () => {
      const [match, pm_match] = makeFragMatch();
      expectSameMatch(match, pm_match);
   });

   it('fills-before the same', () => {
      const after = doc(p());
      const pm_after = pm.doc(pm.p());
      const [match, pm_match] = makeFragMatch();
      const filled = match!.fillBefore(after.content, true);
      const pm_filled = pm_match.fillBefore(pm_after.content, true);

      expect(filled).toBeDefined();
      expect(pm_filled).toBeDefined();
      expect(filled!.size).toBe(pm_filled.size);
   });
});

describe('fillBefore', () => {
   function expectFill(pattern: string, before: EditorNode, after: EditorNode) {
      const patternMatch = matchNodes(pattern);
      const beforeMatch = patternMatch.matchFragment(before.content);
      const filled: Fragment | undefined =
         beforeMatch !== undefined
            ? beforeMatch.fillBefore(after.content, true)
            : Fragment.empty;

      return {
         toBe(result: EditorNode) {
            expect(filled).toBeDefined();
            expect(filled!.toJSON()).toEqual(result.content.toJSON());
         },
         toBeUndefined() {
            expect(filled).toBeUndefined();
         }
      };
   }

   function expectDoubleFill(
      pattern: string,
      before: EditorNode,
      within: EditorNode,
      after: EditorNode
   ) {
      const patternMatch = matchNodes(pattern);
      const beforeMatch = patternMatch.matchFragment(before.content);
      const fillBefore =
         beforeMatch !== undefined
            ? beforeMatch.fillBefore(within.content)
            : undefined;

      let fillAfter: Fragment | undefined;

      if (fillBefore !== undefined) {
         const withinMatch = patternMatch.matchFragment(
            before.content.append(fillBefore).append(within.content)
         );
         if (withinMatch !== undefined) {
            fillAfter = withinMatch.fillBefore(after.content, true);
         }
      }

      return {
         toBe(left: EditorNode, right: EditorNode) {
            expect(fillBefore).toBeDefined();
            expect(fillAfter).toBeDefined();
            expect(fillBefore!.toJSON()).toEqual(left.content.toJSON());
            expect(fillAfter!.toJSON()).toEqual(right.content.toJSON());
         },
         toBeUndefined() {
            expect(fillAfter).toBeUndefined();
         }
      };
   }
   it('returns the empty fragment when things match', () =>
      expectFill(
         typeSequence(Item.Paragraph, Item.Line, Item.Paragraph),
         doc(p(), hr),
         doc(p())
      ).toBe(doc()));

   it('adds a node when necessary', () =>
      expectFill(
         typeSequence(Item.Paragraph, Item.Line, Item.Paragraph),
         doc(p()),
         doc(p())
      ).toBe(doc(hr)));

   it('accepts an asterisk across the bound', () =>
      expectFill(`${Item.Break}*`, p(br), p(br)).toBe(p()));

   it('accepts an asterisk only on the left', () =>
      expectFill(`${Item.Break}*`, p(br), p()).toBe(p()));

   it('accepts an asterisk only on the right', () =>
      expectFill(`${Item.Break}*`, p(), p(br)).toBe(p()));

   it('accepts an asterisk with no elements', () =>
      expectFill(`${Item.Break}*`, p(), p()).toBe(p()));

   it('accepts a plus across the bound', () =>
      expectFill(`${Item.Break}+`, p(br), p(br)).toBe(p()));

   it('adds an element for a content-less plus', () =>
      expectFill(`${Item.Break}+`, p(), p()).toBe(p(br)));

   it('fails for a mismatched plus', () =>
      expectFill(`${Item.Break}+`, p(), p(img)).toBeUndefined());

   it('accepts asterisk with content on both sides', () =>
      expectFill('heading* paragraph*', doc(h1()), doc(p())).toBe(doc()));

   it('accepts asterisk with no content after', () =>
      expectFill('heading* paragraph*', doc(h1()), doc()).toBe(doc()));

   it('accepts plus with content on both sides', () =>
      expectFill('heading+ paragraph+', doc(h1()), doc(p())).toBe(doc()));

   it('accepts plus with no content after', () =>
      expectFill('heading+ paragraph+', doc(h1()), doc()).toBe(doc(p())));

   it('adds elements to match a count', () =>
      expectFill('hard_break{3}', p(br), p(br)).toBe(p(br)));

   it('fails when there are too many elements', () =>
      expectFill('hard_break{3}', p(br, br), p(br, br)).toBeUndefined());

   it('adds elements for two counted groups', () =>
      expectFill('code_block{2} paragraph{2}', doc(pre()), doc(p())).toBe(
         doc(pre(), p())
      ));

   it('does not include optional elements', () =>
      expectFill('heading paragraph? horizontal_rule', doc(h1()), doc()).toBe(
         doc(hr)
      ));

   it('completes a sequence', () =>
      expectDoubleFill(
         typeSequence(
            Item.Paragraph,
            Item.Line,
            Item.Paragraph,
            Item.Line,
            Item.Paragraph
         ),
         doc(p()),
         doc(p()),
         doc(p())
      ).toBe(doc(hr), doc(hr)));

   it('accepts plus across two bounds', () =>
      expectDoubleFill(
         'code_block+ paragraph+',
         doc(pre()),
         doc(pre()),
         doc(p())
      ).toBe(doc(), doc()));

   it('fills a plus from empty input', () =>
      expectDoubleFill('code_block+ paragraph+', doc(), doc(), doc()).toBe(
         doc(),
         doc(pre(), p())
      ));

   it('completes a count', () =>
      expectDoubleFill(
         'code_block{3} paragraph{3}',
         doc(pre()),
         doc(p()),
         doc()
      ).toBe(doc(pre(), pre()), doc(p(), p())));

   it('fails on non-matching elements', () =>
      expectDoubleFill(
         'paragraph*',
         doc(p()),
         doc(pre()),
         doc(p())
      ).toBeUndefined());

   it('completes a plus across two bounds', () =>
      expectDoubleFill('paragraph{4}', doc(p()), doc(p()), doc(p())).toBe(
         doc(),
         doc(p())
      ));

   it('refuses to complete an overflown count across two bounds', () =>
      expectDoubleFill(
         'paragraph{2}',
         doc(p()),
         doc(p()),
         doc(p())
      ).toBeUndefined());
});
