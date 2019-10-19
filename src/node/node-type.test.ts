import '@toba/test';
import { compare } from '../test/';

describe('duplicate ProseMirror functionality', () => {
   it('determines if type has required attributes', () => {
      const [p, pm_p] = compare.nodeTypes();

      expect(p.hasRequiredAttrs()).toBe(pm_p.hasRequiredAttrs());
      expect(p.isText).toBe(pm_p.isText);
   });
});
