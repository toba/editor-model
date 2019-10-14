import '@toba/test';
import { makeNodeTypes } from './__mocks__/compare';

describe('duplicate ProseMirror functionality', () => {
   it('determines if type has required attributes', () => {
      const [p, pm_p] = makeNodeTypes();

      expect(p.hasRequiredAttrs()).toBe(pm_p.hasRequiredAttrs());
      expect(p.isText).toBe(pm_p.isText);
   });
});
