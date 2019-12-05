import {
   TokenStream,
   parseExpr,
   Expression,
   parseNFA,
   NFA,
   ContentMatch
} from '../match';
import { NodeType, EditorNode } from '../node';
import { pm } from './proxy';
import { doc, p } from './mocks';
import { typeSequence, TestNode } from './test-maker';
import { basicSchema, SchemaTag as tag } from '../schema';
import { ParseContext, Parser } from '../parse';
import { ReplaceStep } from '../transform/replace-step';
import { Slice } from '../node/slice';
import { Fragment } from '../node/fragment';

// Methods to create parallel instances of ProseMirror and Toba entities
// based on the basic schema

/**
 * Create token streams with internal methods and original ProseMirror source.
 */
export const makeStreams = (
   pattern = typeSequence(tag.Paragraph, tag.Line, tag.Paragraph)
): [TokenStream, any] => [
   new TokenStream(pattern, basicSchema.nodes),
   new pm.TokenStream(pattern, pm.testSchema.nodes)
];

/**
 * Create expressions with Toba methods and original ProseMirror source.
 */
export const makeExpressions = (pattern?: string): [Expression, any] => {
   const [stream, pm_stream] = makeStreams(pattern);
   return [parseExpr(stream), pm.parseExpr(pm_stream)];
};

/**
 * Create Non-deterministic Finite Automota with Toba methods and original
 * ProseMirror source.
 */
export const makeNFA = (pattern?: string): [NFA, any] => {
   const [expr, pm_expr] = makeExpressions(pattern);
   return [parseNFA(expr), pm.parseNFA(pm_expr)];
};

/**
 * Create `NodeType` with Toba methods and original ProseMirror source.
 */
export const makeNodeTypes = (name = tag.Paragraph): [NodeType, any] => {
   const spec = basicSchema.nodes[name].spec;
   const pm_spec = pm.testSchema.nodes[name].spec;
   return [
      new NodeType(name, basicSchema, spec),
      new pm.NodeType(name, pm.testSchema, pm_spec)
   ];
};

export const makeParseContext = (html?: string): [ParseContext, any] => {
   const parser = Parser.fromSchema(basicSchema);
   const pm_parser = pm.Parser.fromSchema(pm.testSchema);
   const context = new ParseContext(parser);
   const pm_context = new pm.ParseContext(pm_parser, {});

   if (html !== undefined) {
      const div = document.createElement('div');
      const pm_div = document.createElement('div');
      div.innerHTML = html;
      pm_div.innerHTML = html;
      context.addAll(div).finish();
      pm_context.addAll(pm_div);
      pm_context.finish();
   }

   return [context, pm_context];
};

/**
 * Created a parsed `Match` for Toba and ProseMirror.
 */
export function makeParseMatch(
   pattern = typeSequence(tag.Paragraph, tag.Line, tag.Paragraph)
): [ContentMatch | undefined, any] {
   const match: ContentMatch | undefined = ContentMatch.parse(
      pattern,
      basicSchema.nodes
   );
   const pm_match = pm.ContentMatch.parse(pattern, pm.testSchema.nodes);

   return [match, pm_match];
}

export function makeFragMatch(
   node: TestNode = doc(p()),
   pm_node: any = pm.mock.doc(pm.mock.p()),
   pattern?: string
): [ContentMatch | undefined, any] {
   const [match, pm_match] = makeParseMatch(pattern);
   const fragMatch = match!.matchFragment(node.content);
   const pm_fragMatch = pm_match.matchFragment(pm_node.content);

   return [fragMatch, pm_fragMatch];
}

export const makeTextDoc = (text: string): [TestNode, any] => [
   doc(p(text)),
   pm.mock.doc(pm.mock.p(text))
];

export const makeTextFragment = (text: string): [Fragment, any] => [
   Fragment.from(basicSchema.text(text)),
   pm.Fragment.from(pm.testSchema.text(text))
];

function makeTextSlice(text: string | null): [Slice, any] {
   if (text === null) {
      return [Slice.empty, pm.Slice.empty];
   }
   const [frag, pm_frag] = makeTextFragment(text);

   return [new Slice(frag, 0, 0), new pm.Slice(pm_frag, 0, 0)];
}

export function makeReplaceStep(
   from: number,
   to: number,
   text: string | null = null
): [ReplaceStep, any] {
   const [slice, pm_slice] = makeTextSlice(text);

   return [
      new ReplaceStep(from, to, slice),
      new pm.ReplaceStep(from, to, pm_slice)
   ];
}
