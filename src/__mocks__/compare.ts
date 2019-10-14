import { TokenStream, parseExpr, Expression } from '../token-stream';
import { nfa, NFA } from '../finite-automata';
import { NodeType } from '../node-type';
import {
   nfa as pm_nfa,
   TokenStream as pm_TokenStream,
   parseExpr as pm_parseExpr,
   NodeType as pm_NodeType
} from '@toba/test-prosemirror-model';
import { testSchema, TestTypeName, typeSequence } from '../test-schema';

// Methods to create parallel instances of ProseMirror and Editor entities
// based on the basic schema

/**
 * Create token streams with internal methods and original ProseMirror source.
 */
export const makeStreams = (): [TokenStream, any] => {
   const pattern = typeSequence(
      TestTypeName.Paragraph,
      TestTypeName.Line,
      TestTypeName.Paragraph
   );
   return [
      new TokenStream(pattern, testSchema.nodes),
      new pm_TokenStream(pattern, testSchema.nodes)
   ];
};

/**
 * Create expressions with internal methods and original ProseMirror source.
 */
export const makeExpressions = (): [Expression, any] => {
   const [stream, pm_stream] = makeStreams();
   return [parseExpr(stream), pm_parseExpr(pm_stream)];
};

/**
 * Create Non-deterministic Finite Automota with internal methods and original
 * ProseMirror source.
 */
export const makeNFA = (): [NFA, any] => {
   const [expr, pm_expr] = makeExpressions();
   return [nfa(expr), pm_nfa(pm_expr)];
};

/**
 * Create `NodeType` with internal methods and original ProseMirror source.
 */
export const makeNodeTypes = (name = TestTypeName.Paragraph): [NodeType, any] => {
   const spec = testSchema.nodes[name].spec;
   return [
      new NodeType(name, testSchema, spec),
      new pm_NodeType(name, testSchema, spec)
   ];
};
