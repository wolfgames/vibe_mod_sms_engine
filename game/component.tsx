import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { ChildModuleCommunicator, initModule, ModuleResult, ModuleResultType, OperationHandle } from 'module-kit';

// region Frozen
import moduleConfig, { type ModuleConfig } from './configuration';
import { ModuleOperation } from './operation';
import { originConfig } from './origins';
import { interpretResult } from './result-interpretation';
// endregion Frozen

const Component = forwardRef<OperationHandle<ModuleOperation>, {}>(({ }, ref) => {

  // region Frozen
  const [communicator, setCommunicator] = useState<ChildModuleCommunicator | null>(null);
  const [resultHandler, setResultHandler] = useState<((payload: { data: any, config: ModuleConfig, actions: Record<string, string> }) => void) | null>(null);
  const [config, setConfig] = useState<ModuleConfig | null>(null);
  const [moduleUid, setModuleUid] = useState<string | null>(null)
  const [parentConfig, setParentConfig] = useState<Record<string, any>>()


  useEffect(() => {
    try {
      const initCallback = (uid: string, config: Record<string, any>) => {
        setModuleUid(uid)
        setParentConfig(config)
      };
      const {
        communicator,
        resultHandler,
        config
      } = initModule({
        window,
        initCallback,
        configSchema: moduleConfig,
        interpretResult,
        originConfig,
      });

      communicator.sendReady();

      setCommunicator(communicator);
      setResultHandler(() => resultHandler);
      setConfig(config);
    }
    catch (error) {
      console.error('Error initializing module:', error);
    }

    return () => {
      communicator?.cleanup()
    }
  }, []);
  // endregion Frozen

  useImperativeHandle(ref, () => ({
    onOperation: () => { },
    onCancel: () => { },
    onAspectValueChange: () => { },
  }), []);

  const reportExecutionResult = useCallback(() => {
    if (!resultHandler || !config || !communicator || !parentConfig) {
      console.error(`${!resultHandler ? 'Result handler' : !config ? 'Config' : 'Communicator'} not initialized`);
      return;
    }

    if (config.expectedResultType === ModuleResultType.Attempt) {
      resultHandler({
        data: 1,
        config: config,
        actions: parentConfig?.actions
      });
    }

    if (config.expectedResultType === ModuleResultType.Choice) {
      resultHandler({
        data: 0,
        config: config,
        actions: parentConfig?.actions
      });
    }
  }, [parentConfig, config, resultHandler]);

  return <div className="w-full h-full flex items-center justify-center">
    {config ? (
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Module Template</h1>
        <p className="text-lg mb-2">Module ID: {moduleUid}</p>
        <p className="text-sm text-gray-500">Expected result type: {config.expectedResultType}</p>
        <p className="text-sm text-gray-500">Available actions: {JSON.stringify(parentConfig?.actions, null, 2)}</p>

        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={reportExecutionResult}
        >
          Report Execution Result
        </button>
      </div>
    ) : (
      <p>loading...</p>
    )}
  </div>;
});

export default Component;