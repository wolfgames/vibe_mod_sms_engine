import { z } from 'zod';

export enum ModuleResultType {
  Attempt = "attempt",
  Choice = "choice",
}

export enum ModuleReplayAbility {
  Once = 'once',
  RePlayable = 're-playable',
  ReExecutable = 're-executable',
}

export enum ModuleIntegrationType {
  Evidence = 'evidence',
  Standalone = 'standalone',
  Blocking = 'blocking',
  Global = 'global',
  ADA = 'ada',
}

export const baseConfig = z.object({
  replayAbility: z.nativeEnum(ModuleReplayAbility),
  expectedResultType: z.nativeEnum(ModuleResultType),
  integrationType: z.nativeEnum(ModuleIntegrationType),
});

export type BaseConfig = z.TypeOf<typeof baseConfig>;

export const moduleResult = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(ModuleResultType.Attempt),
    data: z.object({
      attemptStatus: z.enum(["fail", "success"]),
    }),
  }),
  z.object({
    type: z.literal(ModuleResultType.Choice),
    data: z.object({
      choiceIndex: z.number(),
    }),
  }),
]);

export type ModuleResult = z.TypeOf<typeof moduleResult>;

export const action = z.string();
export const assetImage = z.object({
  url: z.string(),
  alt: z.string().optional(),
});

export type OperationHandle<Operation> = {
  onOperation: (operation: Operation) => void;
  onCancel: () => void;
  onAspectValueChange: (key: string, value: string | number | boolean | null | undefined) => void;
};
