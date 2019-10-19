import '@toba/test';
import {
   ParseContext as pm_ParseContext,
   DOMParser as pm_DOMParser
} from '@toba/test-prosemirror-model';
import { testSchema as pm_testSchema } from '@toba/test-prosemirror-tester';
import { testSchema } from './test-schema';
import { ParseContext } from './parse-context';
import { DOMParser } from './parse-dom';

describe('duplicate ProseMirror functionality', () => {
   const parser = DOMParser.fromSchema(testSchema);
   const pm_parser = pm_DOMParser.fromSchema(pm_testSchema);

   it('fills in missing stuff', () => {
      const context = new ParseContext(parser);
      const pm_context = new pm_ParseContext(pm_parser, {});

      expect(pm_context).toBeDefined();
      expect(context).toBeDefined();
   });
});
