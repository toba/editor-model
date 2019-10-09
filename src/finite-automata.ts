import { ContentMatch } from './match';
import { Expression, TokenType } from './token-stream';
import { NodeType } from './node-type';
import { SimpleMap } from './types';
import { forEach, makeDuoList } from './list';

// The code below helps compile a regular-expression-like language into a
// deterministic finite automaton. For a good introduction to these concepts,
// see https://swtch.com/~rsc/regexp/regexp1.html

export interface Edge {
   term?: NodeType;
   /** Index of `Edge` this one connects to (or `-1` if not connected) */
   to: number;
}

/**
 * Non-deterministic Finite Automata. "An NFA matches an input string if there
 * is some way it can read the string and follow arrows to a matching state."
 * @see https://swtch.com/~rsc/regexp/regexp1.html
 */
export type NFA = Edge[][];

/**
 * Construct an NFA from an expression as returned by the parser. The NFA is
 * represented as an array of states, which are themselves arrays of edges,
 * which are `{term, to}` objects. The first state is the entry state and the
 * last node is the success state.
 *
 * Note that unlike typical NFAs, the edge ordering in this one is significant,
 * in that it is used to construct filler content when necessary.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/content.js#L270
 */
export function nfa(expr: Expression): NFA {
   const nfa: NFA = [[]];
   /** Add new `Edges` array tp `NFA` and return its index */
   const node = (): number => nfa.push([]) - 1;

   connect(
      compile(expr, 0),
      node()
   );
   return nfa;

   /**
    * Create new edge with `to` and `term` values and add to NFA array at
    * `from` position.
    */
   function edge(from: number, to = -1, term?: NodeType): Edge {
      const edge: Edge = { term, to };
      nfa[from].push(edge);
      return edge;
   }

   /**
    * Assign `to` number to each edge.
    */
   function connect(edges: Edge[], to: number): void {
      forEach(edges, edge => {
         edge.to = to;
      });
   }

   function compile(expr: Expression, from: number): Edge[] {
      if (expr.type == TokenType.Choice) {
         if (expr.exprs === undefined) {
            return [];
         }
         return expr.exprs.reduce(
            (out: Edge[], expr: Expression) => out.concat(compile(expr, from)),
            []
         );
      } else if (expr.type == TokenType.Sequence) {
         if (expr.exprs === undefined) {
            return [];
         }
         for (let i = 0; ; i++) {
            const next = compile(expr.exprs[i], from);

            if (i == expr.exprs.length - 1) {
               return next;
            }
            connect(
               next,
               (from = node())
            );
         }
      } else if (expr.type == TokenType.Star) {
         if (expr.expr === undefined) {
            return [];
         }
         const loop = node();

         edge(from, loop);
         connect(
            compile(expr.expr, loop),
            loop
         );
         return [edge(loop)];
      } else if (expr.type == TokenType.Plus) {
         if (expr.expr === undefined) {
            return [];
         }
         const loop = node();

         connect(
            compile(expr.expr, from),
            loop
         );
         connect(
            compile(expr.expr, loop),
            loop
         );
         return [edge(loop)];
      } else if (expr.type == TokenType.Optional) {
         return [edge(from)].concat(compile(expr.expr!, from));
      } else if (expr.type == TokenType.Range) {
         let cur = from;

         for (let i = 0; i < expr.min!; i++) {
            const next = node();

            connect(
               compile(expr.expr!, cur),
               next
            );
            cur = next;
         }
         if (expr.max == -1) {
            connect(
               compile(expr.expr!, cur),
               cur
            );
         } else {
            for (let i = expr.min; i! < expr.max!; i!++) {
               const next = node();

               edge(cur, next);
               connect(
                  compile(expr.expr!, cur),
                  next
               );
               cur = next;
            }
         }
         return [edge(cur)];
      } else if (expr.type == TokenType.Name) {
         return [edge(from, undefined, expr.value)];
      }
      return [];
   }
}

/**
 * Needed because default array sort is alphabetical.
 */
const numberSort = (n1: number, n2: number) => n1 - n2;

/**
 * Get the set of nodes reachable by `null` edges from `node` index. Omit
 * nodes with only a single null-out-edge, since they may lead to needless
 * duplicated nodes.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/content.js#L333
 */
export function nullFrom(nfa: NFA, node: number): number[] {
   let result: number[] = [];

   scan(node);

   return result.sort(numberSort);

   function scan(node: number): void {
      const edges: Edge[] = nfa[node];

      if (edges.length == 1 && edges[0].term === undefined) {
         return scan(edges[0].to!);
      }
      result.push(node);

      forEach(edges, ({ term, to }) => {
         if (term === undefined && result.indexOf(to!) == -1) {
            scan(to!);
         }
      });
   }
}

type Thing = [NodeType, number[]];

/**
 * Deterministic Finite Automota.
 *
 * Compiles an NFA as produced by `nfa` into a DFA, modeled as a set of state
 * objects (`ContentMatch` instances) with transitions between them.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/content.js#L353
 */
export function nfaToDFA(nfa: NFA): ContentMatch {
   const labeled: SimpleMap<ContentMatch> = Object.create(null);

   return explore(nullFrom(nfa, 0));

   function explore(states: number[]): ContentMatch {
      const out = makeDuoList<NodeType, number[]>();

      forEach(states, node => {
         forEach(nfa[node], ({ term, to }: Edge) => {
            if (term === undefined) {
               return;
            }
            const known: number = out.indexOf(term);
            let set: number[] | null = known > -1 ? out.item(known)![1] : null;

            forEach(nullFrom(nfa, to!), node => {
               if (set === null) {
                  set = [];
                  out.push(term, set);
               }
               if (set.indexOf(node) == -1) {
                  set.push(node);
               }
            });
         });
      });

      const state = new ContentMatch(states.indexOf(nfa.length - 1) > -1);

      labeled[states.join(',')] = state;

      for (let i = 0; i < out.size(); i++) {
         const states: number[] = out.item(i)![1].sort(numberSort);
         let match: ContentMatch = labeled[states.join(',')];

         if (match === undefined) {
            match = explore(states);
         }
         state.next.push(out.item(i)![0], match);
      }
      return state;
   }
}
