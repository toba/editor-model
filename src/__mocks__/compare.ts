import { TokenStream, parseExpr, Expression } from '../token-stream';
import { nfa, NFA } from '../finite-automata';
import { NodeType } from '../node-type';
import { testSchema as pm_testSchema } from '@toba/test-prosemirror-tester';
import {
   nfa as pm_nfa,
   TokenStream as pm_TokenStream,
   parseExpr as pm_parseExpr,
   NodeType as pm_NodeType
} from '@toba/test-prosemirror-model';
import { testSchema, TestTypeName as type, typeSequence } from '../test-schema';

// Methods to create parallel instances of ProseMirror and Editor entities
// based on the basic schema

/**
 * Create token streams with internal methods and original ProseMirror source.
 */
export const makeStreams = (
   pattern = typeSequence(type.Paragraph, type.Line, type.Paragraph)
): [TokenStream, any] => [
   new TokenStream(pattern, testSchema.nodes),
   new pm_TokenStream(pattern, pm_testSchema.nodes)
];

/**
 * Create expressions with Toba methods and original ProseMirror source.
 */
export const makeExpressions = (pattern?: string): [Expression, any] => {
   const [stream, pm_stream] = makeStreams(pattern);
   return [parseExpr(stream), pm_parseExpr(pm_stream)];
};

/**
 * Create Non-deterministic Finite Automota with Toba methods and original
 * ProseMirror source.
 */
export const makeNFA = (pattern?: string): [NFA, any] => {
   const [expr, pm_expr] = makeExpressions(pattern);
   return [nfa(expr), pm_nfa(pm_expr)];
};

/**
 * Create `NodeType` with Toba methods and original ProseMirror source.
 */
export const makeNodeTypes = (name = type.Paragraph): [NodeType, any] => {
   const spec = testSchema.nodes[name].spec;
   const pm_spec = pm_testSchema.nodes[name].spec;
   return [
      new NodeType(name, testSchema, spec),
      new pm_NodeType(name, pm_testSchema, pm_spec)
   ];
};
