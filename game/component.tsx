import { FC, forwardRef, useCallback, useEffect, useImperativeHandle } from 'react';
import { ModuleResult, ModuleResultType, OperationHandle } from './types';
import { ModuleConfiguration } from './configuration';
import { ModuleOperation } from './operation';

type Props = {
  config: ModuleConfiguration;
  result: (result: ModuleResult) => void;
  ready: () => void;
}

export const Component: FC<Props> = forwardRef<OperationHandle<ModuleOperation>, Props>(({ config, result, ready }, ref) => {
  useImperativeHandle(ref, () => ({
    onOperation: () => {},
    onCancel: () => {},
    onAspectValueChange: () => {},
  }), []);

  useEffect(() => {
    ready();
  }, [ready]);

  const reportExecutionResult = useCallback(() => {
    if (config.expectedResultType === ModuleResultType.Attempt) {
      result({
        type: ModuleResultType.Attempt,
        data: { attemptStatus: "success" },
      });
    }

    if (config.expectedResultType === ModuleResultType.Choice) {
      result({
        type: ModuleResultType.Choice,
        data: { choiceIndex: 0 },
      });
    }
  }, [config, result]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      reportExecutionResult();
    }, 1000);

    return () => clearTimeout(timeout);
  }, [reportExecutionResult]);

  return <p>Hello World</p>;
});
