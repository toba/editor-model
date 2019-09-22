import { Fragment } from './fragment';
import { EditorNode } from './node';
import { NodeType } from './node-type';
import { nfa, dfa } from './finite-automata';
import { TokenStream, parseExpr } from './token-stream';
import { OrderedMap } from './ordered-map';
import { AttributeMap } from './attribute';

interface NodeEdge {
   type: NodeType;
   next: ContentMatch;
}

interface ActiveMatch {
   match: ContentMatch;
   type: NodeType | null;
   via: ActiveMatch | null;
}

/**
 * Instances of this class represent a match state of a node type's
 * [content expression](#model.NodeSpec.content), and can be used to find out
 * whether further content matches here, and whether a given position is a valid
 * end of the node.
 *
 * @see https://github.com/ProseMirror/prosemirror-model/blob/master/src/content.js
 */
export class ContentMatch {
   /** Whether this match state represents a valid end of the node */
   validEnd: boolean;
   next: [NodeType, ContentMatch][];
   wrapCache: [NodeType, NodeType[]][];

   /**
    * @param validEnd Whether match state represents a valid end of the node
    */
   constructor(validEnd: boolean) {
      this.validEnd = validEnd;
      this.next = [];
      this.wrapCache = [];
   }

   static parse(
      string: string,
      nodeTypes: { [key: string]: NodeType }
   ): ContentMatch {
      const stream = new TokenStream(string, nodeTypes);

      if (stream.next === null) {
         return ContentMatch.empty;
      }
      let expr = parseExpr(stream);

      if (stream.next !== undefined) {
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
      const found = this.next.find(([t, m]) => t === type);
      return found === undefined ? null : found[1];
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
      const first = this.next[0];
      return first !== undefined ? first[0].isInline : false;
   }

   /**
    * Get the first matching node type at this match position that can be
    * generated.
    */
   get defaultType(): NodeType | undefined {
      const found = this.next.find(
         ([t, _]) => !(t.isText || t.hasRequiredAttrs)
      );
      return found !== undefined ? found[0] : found;
   }

   compatible(other: ContentMatch | null): boolean {
      if (other === null) {
         return false;
      }
      for (let i = 0; i < this.next.length; i++) {
         for (let j = 0; j < other.next.length; j++) {
            if (this.next[i][0] === other.next[j][0]) {
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
      /** Matches that have already been processed */
      let seen: ContentMatch[] = [this];

      function search(
         searchMatch: ContentMatch,
         types: NodeType[]
      ): Fragment | undefined {
         let finished: ContentMatch | null = searchMatch.matchFragment(
            after,
            startIndex
         );
         if (finished !== null && (!toEnd || finished.validEnd)) {
            const nodes = types
               .map(t => t.createAndFill())
               .filter(n => n !== null) as EditorNode[];

            return Fragment.from(nodes);
         }

         for (let i = 0; i < searchMatch.next.length; i++) {
            const [type, match] = searchMatch.next[i];

            if (
               !(type.isText || type.hasRequiredAttrs()) &&
               !seen.includes(match)
            ) {
               seen.push(match);
               const found = search(match, types.concat(type));

               if (found !== undefined) {
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
   findWrapping(target: NodeType): NodeType[] | null {
      for (let i = 0; i < this.wrapCache.length; i++) {
         const [type, wrapTypes] = this.wrapCache[i];

         if (type === target) {
            return wrapTypes;
         }
      }
      const computed = this.computeWrapping(target);

      if (computed !== null) {
         this.wrapCache.push([target, computed]);
      }
      return computed;
   }

   computeWrapping(target: NodeType): NodeType[] | null {
      /** Names of `NodeType`s that have already been processed */
      const seen: { [key: string]: boolean } = Object.create(null);
      const active: ActiveMatch[] = [{ match: this, type: null, via: null }];

      while (active.length) {
         const current: ActiveMatch = active.shift()!;
         const match: ContentMatch = current.match;

         if (match.matchType(target) !== null) {
            const result: NodeType[] = [];

            for (let obj = current; obj.type; obj = obj.via!) {
               result.push(obj.type);
            }
            return result.reverse();
         }

         match.next.forEach(([type, m]) => {
            if (
               !type.isLeaf &&
               !type.hasRequiredAttrs() &&
               !(type.name in seen) &&
               type.contentMatch !== null &&
               (current.type === null || m.validEnd)
            ) {
               active.push({ match: type.contentMatch, type, via: current });
               seen[type.name] = true;
            }
         });
      }
      return null;
   }

   /**
    * The number of outgoing edges this node has in the finite automaton that
    * describes the content expression.
    */
   get edgeCount(): number {
      return this.next.length >> 1;
   }

   /**
    * Get the `n`th outgoing edge from this node in the finite automaton that
    * describes the content expression.
    */
   edge(n: number): NodeEdge {
      let i = n << 1;

      if (i > this.next.length) {
         throw new RangeError(`There's no ${n}th edge in this content match`);
      }
      const [type, next] = this.next[i];

      return { type, next };
   }

   toString(): string {
      /** Matches that have been scanned */
      const seen: ContentMatch[] = [];

      function scan(match: ContentMatch) {
         seen.push(match);
         match.next
            .map(([, m]) => m)
            .filter(m => !seen.includes(m))
            .forEach(scan);
      }
      scan(this);

      return seen
         .map((m, i) => {
            let out = i + (m.validEnd ? '*' : ' ') + ' ';
            for (let i = 0; i < m.next.length; i++) {
               const [type, match] = m.next[i];
               out += (i ? ', ' : '') + type.name + '->' + seen.indexOf(match);
            }
            return out;
         })
         .join('\n');
   }

   static empty = new ContentMatch(true);
}

function checkForDeadEnds(rootMatch: ContentMatch, stream: TokenStream) {
   for (let i = 0, work = [rootMatch]; i < work.length; i++) {
      const state: ContentMatch = work[i];
      const types: string[] = [];
      let deadEnd: boolean = !state.validEnd;

      for (let j = 0; j < state.next.length; j++) {
         const [type, match] = state.next[j];

         types.push(type.name);

         if (deadEnd && !(type.isText || type.hasRequiredAttrs())) {
            deadEnd = false;
         }
         if (work.indexOf(match) == -1) {
            work.push(match);
         }
      }
      if (deadEnd)
         stream.err(
            'Only non-generatable nodes (' +
               types.join(', ') +
               ') in a required position'
         );
   }
}
