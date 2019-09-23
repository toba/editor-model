import '@toba/test';
import { Schema } from './schema';
import { basicSchema as basic } from './__mocks__/basic-schema';
import { Expression, TokenType } from './token-stream';
import { nullFrom } from './finite-automata';
import { NodeType } from './node-type';

const basicSchema = new Schema({
   nodes: basic.spec.nodes,
   marks: basic.spec.marks
});

// const expr: Expression = {
//    type: TokenType.Plus,
//    expr: {
//       type: TokenType.Choice,
//       exprs: [
//          {
//             type: TokenType.Name,
//             value: new NodeType();
//          }
//       ]
//    }
// };

it('does a thing', () => {
   expect(nullFrom).toBeDefined();
   expect(basicSchema).toBeDefined();
});
