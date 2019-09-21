import { NodeType } from './node-type';

export const enum TokenType {
   Choice = 'choice',
   Name = 'name',
   Optional = 'opt',
   Plus = 'plus',
   Range = 'range',
   Sequence = 'seq',
   Star = 'star'
}

export interface Expression {
   type: TokenType;
   min?: number;
   max?: number;
   value?: NodeType;
   expr?: Expression;
   exprs?: Expression[];
}

export class TokenStream {
   string: string;
   nodeTypes: { [key: string]: NodeType };
   tokens: string[];
   /** Position of current token */
   pos: number;
   inline: boolean | null;

   constructor(string: string, nodeTypes: { [key: string]: NodeType }) {
      this.string = string;
      this.nodeTypes = nodeTypes;
      this.inline = null;
      this.pos = 0;
      this.tokens = string.split(/\s*(?=\b|\W|$)/);

      // remove empty strings from start and end

      if (this.tokens[this.tokens.length - 1] == '') {
         this.tokens.pop();
      }
      if (this.tokens[0] == '') {
         this.tokens.unshift();
      }
   }

   get next(): string | undefined {
      return this.tokens[this.pos];
   }

   eat = (token: string): number | boolean =>
      this.next == token && (this.pos++ || true);

   err(str: string): never {
      throw new SyntaxError(
         str + " (in content expression '" + this.string + "')"
      );
   }
}

function parseExprSubscript(stream: TokenStream): Expression {
   let expr = parseExprAtom(stream);
   for (;;) {
      if (stream.eat('+')) {
         expr = { type: TokenType.Plus, expr };
      } else if (stream.eat('*')) {
         expr = { type: TokenType.Star, expr };
      } else if (stream.eat('?')) {
         expr = { type: TokenType.Optional, expr };
      } else if (stream.eat('{')) {
         expr = parseExprRange(stream, expr);
      } else {
         break;
      }
   }
   return expr;
}

function parseExprSeq(stream: TokenStream): Expression {
   const exprs: Expression[] = [];
   do {
      exprs.push(parseExprSubscript(stream));
   } while (stream.next && stream.next != ')' && stream.next != '|');

   return exprs.length == 1 ? exprs[0] : { type: TokenType.Sequence, exprs };
}

export function parseExpr(stream: TokenStream) {
   const exprs: Expression[] = [];
   do {
      exprs.push(parseExprSeq(stream));
   } while (stream.eat('|'));

   return exprs.length == 1 ? exprs[0] : { type: TokenType.Choice, exprs };
}

function parseNum(stream: TokenStream): number {
   const next = stream.next;

   if (next === undefined || /\D/.test(next)) {
      // TODO: with TS 3.7 stream.err can be an assert
      return stream.err("Expected number, got '" + next + "'");
   }
   const result = Number(next);
   stream.pos++;

   return result;
}

function parseExprRange(stream: TokenStream, expr?: Expression): Expression {
   const min = parseNum(stream);
   let max = min;
   
   if (stream.eat(',')) {
      if (stream.next != '}') {
         max = parseNum(stream);
      } else {
         max = -1;
      }
   }
   if (!stream.eat('}')) {
      stream.err('Unclosed braced range');
   }
   return { type: TokenType.Range, min, max, expr };
}

function resolveName(stream: TokenStream, name: string): NodeType[] {
   const types = stream.nodeTypes;
   let type: NodeType | undefined = types[name];

   if (type !== undefined) {
      return [type];
   }
   const result: NodeType[] = [];

   for (let typeName in types) {
      type = types[typeName];
      if (type.groups.indexOf(name) > -1) {
         result.push(type);
      }
   }
   if (result.length == 0) {
      stream.err("No node type or group '" + name + "' found");
   }
   return result;
}

function parseExprAtom(stream: TokenStream): Expression {
   if (stream.eat('(')) {
      const expr = parseExpr(stream);

      if (!stream.eat(')')) {
         stream.err('Missing closing paren');
      }
      return expr;
   } else if (stream.next !== undefined && !/\W/.test(stream.next)) {
      const exprs: Expression[] = resolveName(stream, stream.next).map(
         (type: NodeType) => {
            if (stream.inline === null) {
               stream.inline = type.isInline;
            } else if (stream.inline !== type.isInline) {
               stream.err('Mixing inline and block content');
            }
            return { type: TokenType.Name, value: type };
         }
      );
      stream.pos++;

      return exprs.length == 1 ? exprs[0] : { type: TokenType.Choice, exprs };
   } else {
      stream.err("Unexpected token '" + stream.next + "'");
      // this return is here only to make TypeScript happy since it can't tell
      // that stream.err() will always throw an error
      return { type: TokenType.Choice };
   }
}
