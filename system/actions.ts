import { z } from 'zod';
import { BaseActions, type BaseActionsType } from 'wolfy-module-kit';

enum CustomActions {
  // add custom module actions here
  CustomAction = 'custom-action'
}

// DO NOT MODIFY FROZEN REGION BELOW
// region Frozen
export const AppActionsSchema = z.nativeEnum({
  ...BaseActions,
  ...CustomActions,
} as const);

export type AppActions = z.TypeOf<typeof AppActionsSchema>;
// endregion Frozen