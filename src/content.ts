import { Fragment } from './fragment';
import { EditorNode } from './node';
import { NodeType } from './node-type';
import { nfa, dfa } from './finite-automata';
import { TokenStream, parseExpr } from './token-stream';

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
    * Whether this match state represents a valid end of the nod.
    */
   validEnd: boolean;
   nextType: NodeType[];
   nextMatch: ContentMatch[];
   cacheType: NodeType[];
   cacheMatch: ContentMatch[];

   /**
    * @param validEnd Whether match state represents a valid end of the node
    */
   constructor(validEnd: boolean) {
      this.validEnd = validEnd;
      this.nextType = [];
      this.nextMatch = [];
      this.cacheType = [];
      this.cacheMatch = [];
   }

   static parse(
      string: string,
      nodeTypes: { [key: string]: NodeType }
   ): ContentMatch {
      let stream = new TokenStream(string, nodeTypes);

      if (stream.next === null) {
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
      const index = this.nextType.findIndex(n => n === type);
      return index >= 0 ? this.nextMatch[index] : null;
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

   get inlineContent(): boolean {
      const first = this.nextType[0];
      return first ? first.isInline : false;
   }

   /**
    * Get the first matching node type at this match position that can be
    * generated.
    */
   get defaultType(): NodeType | undefined {
      return this.nextType.find(t => !(t.isText || t.hasRequiredAttrs));
   }

   compatible(other: ContentMatch | null): boolean {
      if (other === null) {
         return false;
      }
      for (let i = 0; i < this.nextType.length; i++) {
         for (let j = 0; j < other.nextType.length; j++) {
            if (this.nextType[i] === other.nextType[j]) {
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
      let seen: ContentMatch[] = [this];

      function search(
         match: ContentMatch,
         types: NodeType[]
      ): Fragment | undefined {
         let finished: ContentMatch | null = match.matchFragment(
            after,
            startIndex
         );
         if (finished !== null && (!toEnd || finished.validEnd)) {
            const nodes = types
               .map(t => t.createAndFill())
               .filter(n => n !== null) as EditorNode[];

            return Fragment.from(nodes);
         }

         for (let i = 0; i < match.nextType.length; i++) {
            const type = match.nextType[i];
            const next = match.nextMatch[i];

            if (
               !(type.isText || type.hasRequiredAttrs()) &&
               seen.indexOf(next) == -1
            ) {
               seen.push(next);

               let found = search(next, types.concat(type));
               if (found) {
                  return found;
               }
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
      for (let i = 0; i < this.cacheType.length; i++) {
         if (this.cacheType[i] === target) {
            return this.cacheType[i + 1];
         }
      }
      let computed = this.computeWrapping(target);
      this.cacheType.push(target, computed);

      return computed;
   }

   computeWrapping(target: NodeType): NodeType[] {
      const seen = Object.create(null);
      const active: ActiveMatch[] = [{ match: this, type: null, via: null }];

      while (active.length) {
         const current = active.shift()!;
         const match = current.match;

         if (match.matchType(target) !== null) {
            let result = [];
            for (let obj = current; obj.type; obj = obj.via) {
               result.push(obj.type);
            }
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
