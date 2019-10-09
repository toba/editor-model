import '@toba/test';
import { Schema } from './schema';
import { TokenStream, parseExpr, Expression } from './token-stream';
import { nfa, NFA, Edge, nfaToDFA } from './finite-automata';
import {
   nfa as pm_nfa,
   dfa as pm_nfaToDFA,
   TokenStream as pm_TokenStream,
   parseExpr as pm_parseExpr
} from 'prosemirror-model';
import {
   basicSchema,
   SchemaType,
   typeSequence
} from './__mocks__/basic-schema';
import { ContentMatch } from './match';

const schema = new Schema({
   nodes: basicSchema.spec.nodes,
   marks: basicSchema.spec.marks
});

const makeStreams = (): [TokenStream, any] => {
   const pattern = typeSequence(
      SchemaType.Paragraph,
      SchemaType.Line,
      SchemaType.Paragraph
   );
   return [
      new TokenStream(pattern, schema.nodes),
      new pm_TokenStream(pattern, schema.nodes)
   ];
};

const makeExpressions = (): [Expression, any] => {
   const [stream, pm_stream] = makeStreams();
   return [parseExpr(stream), pm_parseExpr(pm_stream)];
};

const makeNFA = (): [NFA, any] => {
   const [expr, pm_expr] = makeExpressions();
   return [nfa(expr), pm_nfa(pm_expr)];
};

it('creates token streams the same as ProseMirror', () => {
   const [stream, pm_stream] = makeStreams();

   expect(stream.pattern).toBe(pm_stream.string);
   expect(stream.tokens).toEqual(pm_stream.tokens);
});

it('parses expressions the same as ProseMirror', () => {
   const [expr, pm_expr] = makeExpressions();

   expect(expr.type).toBe(pm_expr.type);
   expect(expr.exprs!.length).toBe(pm_expr.exprs.length);

   for (let i = 0; i < expr.exprs!.length; i++) {
      const ex = expr.exprs![i];
      const pm_ex = pm_expr.exprs[i];

      expect(ex.type).toBe(pm_ex.type);
      expect(ex.value!.name).toBe(pm_ex.value.name);
   }
   expect(pm_expr).toBeDefined();
});

it('creates finite automata the same as ProseMirror', () => {
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

it('creates match the same as ProseMirror', () => {
   const [auto, pm_auto] = makeNFA();
   const match: ContentMatch = nfaToDFA(auto);
   const pm_match: any = pm_nfaToDFA(pm_auto);

   expect(match.edgeCount).toBe(pm_match.edgeCount);
});
