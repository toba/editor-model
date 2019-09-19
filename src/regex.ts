import { ContentMatch } from './content';
import { Expression, TokenType } from './token-stream';

// The code below helps compile a regular-expression-like language
// into a deterministic finite automaton. For a good introduction to
// these concepts, see https://swtch.com/~rsc/regexp/regexp1.html

interface Edge {
   term?: any;
   to?: number | null;
}

/**
 * Non-deterministic Finite Automata. "An NFA matches an input string if there
 * is some way it can read the string and follow arrows to a matching state."
 * @see https://swtch.com/~rsc/regexp/regexp1.html
 */
type NFA = Edge[][];

/**
 * Construct an NFA from an expression as returned by the parser. The NFA is
 * represented as an array of states, which are themselves arrays of edges,
 * which are `{term, to}` objects. The first state is the entry state and the
 * last node is the success state.
 *
 * Note that unlike typical NFAs, the edge ordering in this one is significant,
 * in that it is used to contruct filler content when necessary.
 */
export function nfa(expr: Expression): NFA {
   const nfa: NFA = [[]];
   const node = () => nfa.push([]) - 1;

   connect(
      compile(expr, 0),
      node()
   );
   return nfa;

   /**
    * Create new edge with `to` and `term` values and add to NFA array at
    * `from` position.
    */
   function edge(from: number, to?: number | null, term?: any): Edge {
      const edge: Edge = { term, to };
      nfa[from].push(edge);
      return edge;
   }

   /**
    * Assign `to` number to each edge.
    */
   function connect(edges: Edge[], to?: number | null): void {
      edges.forEach(edge => (edge.to = to));
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
            let next = compile(expr.exprs[i], from);
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
         let loop = node();
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
         let loop = node();
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
         return [edge(from)].concat(compile(expr.expr, from));
      } else if (expr.type == TokenType.Range) {
         let cur = from;
         for (let i = 0; i < expr.min; i++) {
            let next = node();
            connect(
               compile(expr.expr, cur),
               next
            );
            cur = next;
         }
         if (expr.max == -1) {
            connect(
               compile(expr.expr, cur),
               cur
            );
         } else {
            for (let i = expr.min; i < expr.max; i++) {
               let next = node();
               edge(cur, next);
               connect(
                  compile(expr.expr, cur),
                  next
               );
               cur = next;
            }
         }
         return [edge(cur)];
      } else if (expr.type == TokenType.Name) {
         return [edge(from, null, expr.value)];
      }
   }
}

const cmp = (a: number, b: number) => a - b;

/**
 * Get the set of nodes reachable by `null` edges from `node`. Omit nodes with
 * only a single null-out-edge, since they may lead to needless duplicated
 * nodes.
 */
function nullFrom(nfa: NFA, node: number) {
   let result: number[] = [];

   scan(node);

   return result.sort(cmp);

   function scan(node: number): void {
      const edges: Edge[] = nfa[node];

      if (edges.length == 1 && !edges[0].term) {
         return scan(edges[0].to!);
      }
      result.push(node);

      for (let i = 0; i < edges.length; i++) {
         let { term, to } = edges[i];
         if (!term && result.indexOf(to) == -1) {
            scan(to);
         }
      }
   }
}

/**
 * Deterministic Finite Automota.
 *
 * Compiles an NFA as produced by `nfa` into a DFA, modeled as a set of state
 * objects (`ContentMatch` instances) with transitions between them.
 */
export function dfa(nfa: NFA): ContentMatch {
   const labeled = Object.create(null);

   return explore(nullFrom(nfa, 0));

   function explore(states: number[]) {
      let out: any[] = [];

      states.forEach(node => {
         nfa[node].forEach(({ term, to }) => {
            if (!term) {
               return;
            }
            const known: number = out.indexOf(term);
            let set: number[] = known > -1 && out[known + 1];

            nullFrom(nfa, to).forEach(node => {
               if (!set) {
                  out.push(term, (set = []));
               }
               if (set.indexOf(node) == -1) {
                  set.push(node);
               }
            });
         });
      });
      let state = (labeled[states.join(',')] = new ContentMatch(
         states.indexOf(nfa.length - 1) > -1
      ));

      for (let i = 0; i < out.length; i += 2) {
         let states = out[i + 1].sort(cmp);
         state.next.push(out[i], labeled[states.join(',')] || explore(states));
      }
      return state;
   }
}
