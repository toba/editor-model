import '@toba/test';
import { ContentMatch, Edge, NFA } from '../match';
import { ParseContext } from '../parse';
import { EditorNode, NodeType, NodeContext } from '../node';
import { makeNFA } from './compare';

export function expectSameMatch(
   match: ContentMatch | undefined,
   pm_match: any
): void {
   expect(match).toBeDefined();

   if (match === undefined) {
      return;
   }
   let recurseCount = 0;

   const compareMatch = (m1: ContentMatch, m2: any) => {
      expect(m1.edgeCount).toBe(m2.edgeCount);
      expect(m1.validEnd).toBe(m2.validEnd);

      if (m1.defaultType !== undefined) {
         expect(m1.defaultType.name).toBe(m2.defaultType.name);
      } else {
         expect(m2.defaultType).toBeUndefined();
      }

      expect(m1.next.size()).toBe(m2.next.length / 2);

      m1.next.each((node, m, index) => {
         const pm_node = m2.next[index * 2];
         const pm_m = m2.next[index * 2 + 1];

         expect(node.name).toBe(pm_node.name);

         if (recurseCount < 25) {
            compareMatch(m, pm_m);
         }
         recurseCount++;
      });
   };

   compareMatch(match, pm_match);
}

export function expectSameNodeType(type: NodeType, pm_type: any): void {
   expect(type).toBeDefined();
   expect(pm_type).toBeDefined();
   expect(type.isInline).toBe(pm_type.isInline);
   expect(type.allowedMarks).toEqual(pm_type.markSet);
}

export function expectSameNode(node: EditorNode, pm_node: any): void {
   expect(node).toBeDefined();
   expect(pm_node).toBeDefined();

   if (pm_node.isAtom === undefined) {
      expect(node.isAtom).toBe(false);
   } else {
      expect(node.isAtom).toBe(pm_node.isAtom);
   }
   expect(node.isBlock).toBe(pm_node.isBlock);
   expect(node.isInline).toBe(pm_node.isInline);
   expect(node.isLeaf).toBe(pm_node.isLeaf);
   expect(node.isText).toBe(pm_node.isText);
   expect(node.textContent).toBe(pm_node.textContent);
   expect(node.size).toBe(pm_node.nodeSize);

   expectSameNodeType(node.type, pm_node.type);
}

export function expectSameNodeContext(ctx: NodeContext, pm_ctx: any): void {
   expect(ctx.content.length).toBe(pm_ctx.content.length);
   expect(ctx.solid).toBe(pm_ctx.solid);

   ctx.content.forEach((node, i) => {
      expectSameNode(node, pm_ctx.content[i]);
   });
}

export function expectSameParseContext(
   context: ParseContext,
   pm_context: any
): void {
   expect(context).toBeDefined();
   expect(pm_context).toBeDefined();

   expect(context.currentPos).toBe(pm_context.currentPos);
   expect(context.openElementCount).toBe(pm_context.open);
   expect(context.needsBlock).toBe(pm_context.needsBlock);
   expect(context.find).toEqual(pm_context.find);
   expect(context.nodes.length).toBe(pm_context.nodes.length);

   context.nodes.forEach((ctx, i) => {
      expectSameNodeContext(ctx, pm_context.nodes[i]);
   });
}

export function expectSameNFA(pattern: string): [NFA, any] {
   const [nfa, pm_nfa] = makeNFA(pattern);

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
