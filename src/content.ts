import { Fragment } from './fragment';
import { NodeType } from './node-type';
import { TokenStream, Expression, parseExpr, TokenType } from './token-stream';

interface NodeEdge {
   type: NodeType;
   next: ContentMatch;
}

interface ActiveMatch {
   match: ContentMatch;
   type: NodeType | null;
   via: ContentMatch | null;
}

/**
 * Instances of this class represent a match state of a node type's
 * [content expression](#model.NodeSpec.content), and can be used to find out
 * whether further content matches here, and whether a given position is a valid
 * end of the node.
 */
export class ContentMatch {
   /**
    * Whether this match state represents a valid end of the node.
    */
   validEnd: boolean;
   // interleaved array of NodeType and ContentMatch
   next: (NodeType | ContentMatch)[]; //[NodeType, ContentMatch];
   wrapCache: NodeType[];

   constructor(validEnd: boolean) {
      this.validEnd = validEnd;
      this.next = [];
      this.wrapCache = [];
   }

   static parse(
      string: string,
      nodeTypes: { [key: string]: NodeType }
   ): ContentMatch {
      let stream = new TokenStream(string, nodeTypes);

      if (stream.next == null) {
         return ContentMatch.empty;
      }
      let expr = parseExpr(stream);

      if (stream.next) {
         stream.err('Unexpected trailing text');
      }
      let match = dfa(nfa(expr));

      checkForDeadEnds(match, stream);

      return match;
   }

   /**
    * Match a node type, returning a match after that node if successful.
    */
   matchType(type: NodeType): ContentMatch | null {
      for (let i = 0; i < this.next.length; i += 2) {
         if (this.next[i] == type) {
            return this.next[i + 1];
         }
      }
      return null;
   }

   /**
    * Try to match a fragment. Returns the resulting match when successful.
    */
   matchFragment(
      frag: Fragment,
      start = 0,
      end = frag.childCount
   ): ContentMatch | null {
      let match: ContentMatch | null = this;

      for (let i = start; match && i < end; i++) {
         match = match.matchType(frag.child(i).type);
      }
      return match;
   }

   get inlineContent() {
      let first = this.next[0];
      return first ? first.isInline : false;
   }

   /**
    * Get the first matching node type at this match position that can be
    * generated.
    */
   get defaultType(): NodeType | undefined {
      for (let i = 0; i < this.next.length; i += 2) {
         let type = this.next[i];
         if (!(type.isText || type.hasRequiredAttrs())) {
            return type;
         }
      }
   }

   compatible(other: ContentMatch | null): boolean {
      if (other === null) {
         return false;
      }
      for (let i = 0; i < this.next.length; i += 2) {
         for (let j = 0; j < other.next.length; j += 2) {
            if (this.next[i] == other.next[j]) {
               return true;
            }
         }
      }
      return false;
   }

   /**
    * Try to match the given fragment, and if that fails, see if it can be made
    * to match by inserting nodes in front of it. When successful, return a
    * fragment of inserted nodes (which may be empty if nothing had to be
    * inserted). When `toEnd` is true, only return a fragment if the resulting
    * match goes to the end of the content expression.
    */
   fillBefore(
      after: Fragment,
      toEnd = false,
      startIndex = 0
   ): Fragment | undefined {
      let seen = [this];

      function search(
         match: ContentMatch,
         types: NodeType[]
      ): Fragment | undefined {
         let finished = match.matchFragment(after, startIndex);
         if (finished && (!toEnd || finished.validEnd))
            return Fragment.from(types.map(tp => tp.createAndFill()));

         for (let i = 0; i < match.next.length; i += 2) {
            let type = match.next[i],
               next = match.next[i + 1];
            if (
               !(type.isText || type.hasRequiredAttrs()) &&
               seen.indexOf(next) == -1
            ) {
               seen.push(next);
               let found = search(next, types.concat(type));
               if (found) return found;
            }
         }
      }

      return search(this, []);
   }

   /**
    * Find a set of wrapping node types that would allow a node of the given
    * type to appear at this position. The result may be empty (when it fits
    * directly) and will be null when no such wrapping exists.
    */
   findWrapping(target: NodeType): NodeType | undefined {
      for (let i = 0; i < this.wrapCache.length; i += 2) {
         if (this.wrapCache[i] == target) {
            return this.wrapCache[i + 1];
         }
      }
      let computed = this.computeWrapping(target);
      this.wrapCache.push(target, computed);

      return computed;
   }

   computeWrapping(target) {
      const seen = Object.create(null);
      const active: ActiveMatch[] = [{ match: this, type: null, via: null }];

      while (active.length) {
         const current = active.shift()!;
         const match = current.match;

         if (match.matchType(target)) {
            let result = [];
            for (let obj = current; obj.type; obj = obj.via)
               result.push(obj.type);
            return result.reverse();
         }
         for (let i = 0; i < match.next.length; i += 2) {
            let type = match.next[i];
            if (
               !type.isLeaf &&
               !type.hasRequiredAttrs() &&
               !(type.name in seen) &&
               (!current.type || match.next[i + 1].validEnd)
            ) {
               active.push({ match: type.contentMatch, type, via: current });
               seen[type.name] = true;
            }
         }
      }
   }

   /**
    * The number of outgoing edges this node has in the finite automaton that
    * describes the content expression.
    */
   get edgeCount(): number {
      return this.next.length >> 1;
   }

   /**
    * Get the _n_th outgoing edge from this node in the finite automaton that
    * describes the content expression.
    */
   edge(n: number): NodeEdge {
      let i = n << 1;
      if (i > this.next.length) {
         throw new RangeError(`There's no ${n}th edge in this content match`);
      }
      return { type: this.next[i], next: this.next[i + 1] };
   }

   toString(): string {
      let seen = [];
      function scan(m) {
         seen.push(m);
         for (let i = 1; i < m.next.length; i += 2)
            if (seen.indexOf(m.next[i]) == -1) scan(m.next[i]);
      }
      scan(this);
      return seen
         .map((m, i) => {
            let out = i + (m.validEnd ? '*' : ' ') + ' ';
            for (let i = 0; i < m.next.length; i += 2)
               out +=
                  (i ? ', ' : '') +
                  m.next[i].name +
                  '->' +
                  seen.indexOf(m.next[i + 1]);
            return out;
         })
         .join('\n');
   }

   static empty = new ContentMatch(true);
}

function checkForDeadEnds(match: ContentMatch, stream: TokenStream) {
   for (let i = 0, work = [match]; i < work.length; i++) {
      const state = work[i];
      const nodes = [];
      let dead = !state.validEnd;

      for (let j = 0; j < state.next.length; j += 2) {
         const node = state.next[j] as NodeType;
         const next = state.next[j + 1] as ContentMatch;

         nodes.push(node.name);

         if (dead && !(node.isText || node.hasRequiredAttrs())) {
            dead = false;
         }
         if (work.indexOf(next) == -1) {
            work.push(next);
         }
      }
      if (dead)
         stream.err(
            'Only non-generatable nodes (' +
               nodes.join(', ') +
               ') in a required position'
         );
   }
}

interface Edge {
   term?: any;
   to?: number | null;
}

/**
 * Non-deterministic Finite Automata
 */
type NFA = Edge[][];

// The code below helps compile a regular-expression-like language
// into a deterministic finite automaton. For a good introduction to
// these concepts, see https://swtch.com/~rsc/regexp/regexp1.html

/**
 * Construct an NFA from an expression as returned by the parser. The NFA is
 * represented as an array of states, which are themselves arrays of edges,
 * which are `{term, to}` objects. The first state is the entry state and the
 * last node is the success state.
 *
 * Note that unlike typical NFAs, the edge ordering in this one is significant,
 * in that it is used to contruct filler content when necessary.
 */
function nfa(expr: Expression): NFA {
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
 * Compiles an NFA as produced by `nfa` into a DFA, modeled as a set of state
 * objects (`ContentMatch` instances) with transitions between them.
 */
function dfa(nfa: NFA): ContentMatch {
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
