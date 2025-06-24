'use client'

import { useRef } from 'react'
import { Component } from '../game/component'
import { ModuleConfiguration } from '../game/configuration'
import { ModuleOperation } from '../game/operation'
import { ModuleResult, ModuleResultType, ModuleReplayAbility, ModuleIntegrationType, OperationHandle } from '../game/types'

// Example configuration - modify as needed
const exampleConfig: ModuleConfiguration = {
  resultAction: "example_action",
  replayAbility: ModuleReplayAbility.RePlayable,
  expectedResultType: ModuleResultType.Attempt,
  integrationType: ModuleIntegrationType.Standalone,
}

export default function Home() {
  const componentRef = useRef<OperationHandle<ModuleOperation>>(null)

  const handleResult = (result: ModuleResult) => {
    console.log('Module result:', result)
    // Handle the result here
  }

  const handleReady = () => {
    console.log('Module is ready')
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Module Demo</h1>
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
          <Component
            ref={componentRef}
            config={exampleConfig}
            result={handleResult}
            ready={handleReady}
          />
        </div>
      </div>
    </main>
  )
}
