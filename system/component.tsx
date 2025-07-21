import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { ActionMap, ChildModuleCommunicator, initModule, ResultPayload, ModuleResultType, OperationHandle } from 'wolfy-module-kit';

// region Frozen
import moduleConfig, { type ModuleConfig } from './configuration';
import { ModuleOperation } from './operation';
import { originConfig } from './origins';
import { interpretResult } from './result-interpretation';
// endregion Frozen

const Component = ({ }) => {

  // region Frozen
  const [moduleCommunicator, setModuleCommunicator] = useState<ChildModuleCommunicator | null>(null);
  const [resultHandler, setResultHandler] = useState<((payload: ResultPayload<ModuleConfig>) => void) | null>(null);
  const [config, setConfig] = useState<ModuleConfig | null>(null);
  const [moduleUid, setModuleUid] = useState<string | null>(null)
  const [actions, setActions] = useState<ActionMap>()
  // endregion Frozen

  // state affected by operations
  const [title, setTitle] = useState<string>("Module Template");

  // aspects record
  const [aspects, setAspects] = useState<Record<string, any>>({});

  const handleAspectUpdate = useCallback((key: string, value: any) => {
    setAspects(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleOperation = useCallback((operation: ModuleOperation) => {
    if (operation.type === 'SET_TITLE') {
      setTitle(operation.value);
    } else {
      console.warn('Unknown operation type:', operation.type);
    }
  }, []);

  // region Frozen
  useEffect(() => {
    let communicator: ChildModuleCommunicator | null = null;
    try {
      const initCallback = (uid: string, actions: ActionMap) => {
        setModuleUid(uid)
        setActions(actions)
      };
      const {
        communicator: effectCommunicator,
        resultHandler,
        config
      } = initModule({
        window,
        initCallback,
        configSchema: moduleConfig,
        interpretResult,
        originConfig,
      });

      communicator = effectCommunicator;

      communicator.onOperation(handleOperation);
      communicator.onAspectUpdate(handleAspectUpdate);

      communicator.sendReady();

      setModuleCommunicator(communicator);
      setResultHandler(() => resultHandler);
      setConfig(config);
    }
    catch (error) {
      console.error('Error initializing module:', error);
    }

    return () => {
      communicator?.cleanup()
    }
  }, [handleOperation, handleAspectUpdate]);
  // endregion Frozen

  const requestAspectChange = useCallback((aspectToChange: string, valueToSet: any) => {
    if (!moduleCommunicator || !aspectsPermissions) return;

    if (aspectsPermissions[aspectToChange] === AspectPermissionType.ReadWrite) {
      moduleCommunicator.requestAspectValueChange(aspectToChange, valueToSet);
    } else {
      console.log(`Module does not have write permission for aspect: ${aspectToChange}`);
    }
  }, [moduleCommunicator, aspectsPermissions]);

  const reportExecutionResult = useCallback(() => {
    if (!resultHandler || !config || !moduleCommunicator || !actions) {
      console.error(`${!resultHandler ? 'Result handler' : !config ? 'Config' : 'Communicator'} not initialized`);
      return;
    }

    if (config.expectedResultType === ModuleResultType.Attempt) {
      resultHandler({
        data: 1,
        config,
        actions
      });
    }

    if (config.expectedResultType === ModuleResultType.Choice) {
      resultHandler({
        data: 0,
        config,
        actions
      });
    }
  }, [actions, config, resultHandler, moduleCommunicator]);

  return <div className="w-full h-full flex items-center justify-center">
    {config ? (
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Operations test: {title}</h1>
        <p className="text-lg mb-2">Module ID: {moduleUid}</p>
        <p className="text-sm text-gray-500">Expected result type: {config.expectedResultType}</p>
        <p className="text-sm text-gray-500">Available actions: {JSON.stringify(actions, null, 2)}</p>

        <div className="mt-4 p-2 bg-gray-100 text-left text-xs">
          <h3 className="font-bold">Received Aspects:</h3>
          <pre>{JSON.stringify(aspects, null, 2)}</pre>
        </div>

        <button
          className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          onClick={() => requestAspectChange('Viewed', (aspects.Viewed || 0) + 1)}
        >
          Request Aspect Change (Viewed +1)
        </button>

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
};

export default Component;