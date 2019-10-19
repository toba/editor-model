import '@toba/test';
import { testSchema, pm } from '../test/';
import { ParseContext } from './parse-context';
import { DOMParser } from './parse-dom';

describe('duplicate ProseMirror functionality', () => {
   const parser = DOMParser.fromSchema(testSchema);
   const pm_parser = pm.DOMParser.fromSchema(pm.testSchema);

   it('fills in missing stuff', () => {
      const context = new ParseContext(parser);
      const pm_context = new pm.ParseContext(pm_parser, {});

      expect(pm_context).toBeDefined();
      expect(context).toBeDefined();
   });
});
