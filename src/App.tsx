import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css'
import {
  ModuleResult, 
  OperationHandle
} from './types';
import { ModuleOperation } from './module/operation';
import Component from './module/component';

function App() {
  const [externalConfig, setExternalConfig] = useState<unknown | null>(null);
  const [parentSource, setParentSource] = useState<MessageEventSource | null>(null);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const onOperation = useRef<((operation: ModuleOperation) => void) | null>(null);
  const onAspectValueChange = useRef<((key: string, value: string | number | boolean | null | undefined) => void) | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data.type === 'init') {
        setParentSource(event.source);
        setParentOrigin(event.origin);
        setExternalConfig(event.data.config);
        window.removeEventListener('message', onMessage);
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    }
  }, []);

  const childRef = useRef<OperationHandle>(null)
  const skippedRef = useRef<Array<unknown>>([]);
  const skippedAspectsRef = useRef<Array<{
    key: string;
    value: Parameters<NonNullable<(typeof onAspectValueChange)['current']>>[1]
  }>>([]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data.type === 'execute-operation') {
        if (!onOperation.current) {
          skippedRef.current.push(event.data.operation);
        }
        // onOperation.current?.(event.data.operation);
        childRef.current?.onOperation?.(event.data.operation);
      }
      if (event.data.type === 'aspect-value-change') {
        if (!onAspectValueChange.current) {
          skippedAspectsRef.current.push(event.data.aspectValueChange);
        }
        // onAspectValueChange.current?.(event.data.operation);
        childRef.current?.onAspectValueChange?.(event.data.aspectValueChange.key, event.data.aspectValueChange.value);
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    }
  }, [onOperation, onAspectValueChange]);

  useEffect(() => {
    window.parent.postMessage('module-ready', { targetOrigin: '*' })
  }, []);

  const sendResult = useCallback((result: ModuleResult) => {
    if (!parentSource || !parentOrigin) {
      return;
    }

    parentSource.postMessage({
      type: 'module-done',
      result
    }, {targetOrigin: parentOrigin})
  }, [parentSource, parentOrigin]);

  const onReady = useCallback(() => {
    if (childRef.current) {
      if (skippedRef.current.length) {
        skippedRef.current.forEach(s => childRef.current?.onOperation?.(s));
        skippedRef.current = [];
      }
      if (skippedAspectsRef.current.length) {
        skippedAspectsRef.current.forEach(s => childRef.current?.onAspectValueChange?.(s.key, s.value));
        skippedAspectsRef.current = [];
      }
    }
  }, []);

  const onGetAssetData = useCallback((asset: symbol) => {
    if (typeof asset === 'object') {
      if ('uid' in asset && 'url' in asset) {
        return asset;
      }
    }
    throw new Error('Unknown asset type');
  }, []);

  if (!externalConfig) {
    return <p>Loading...</p>;
  }

  return (
    <>
      <Component
        ref={childRef}
        ready={onReady}
        config={externalConfig}
        getAssetData={onGetAssetData}
        result={sendResult}
      />
    </>
  )
}

export default App
