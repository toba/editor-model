import '@toba/test';
import { compare, expectSame, pm } from '../test-tools/';

describe('duplicate ProseMirror functionality', () => {
   it('creates same replace step', () => {
      const [step, pm_step] = compare.replaceStep(2, 3);
      expectSame.step(step, pm_step);
   });

   it('merges steps the same', () => {
      const [step1, pm_step1] = compare.replaceStep(2, 3);
      const [step2, pm_step2] = compare.replaceStep(2, 3);
      const merged = step1.merge(step2);
      const pm_merged = pm_step1.merge(pm_step2);

      expect(merged).not.toBeNull();

      expectSame.step(merged!, pm_merged);
   });

   it('applies nodes the same', () => {
      const [testDoc, pm_testDoc] = compare.textDoc('foobar');
      const [step, pm_step] = compare.replaceStep(2, 3);

      expectSame.node(testDoc, pm_testDoc);
      expectSame.step(step, pm_step);
      expectSame.stepResult(step.apply(testDoc), pm_step.apply(pm_testDoc));
   });
});
