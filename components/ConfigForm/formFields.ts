import { AppActionsSchema } from "@/system/actions"
import { ModuleReplayAbility, ModuleIntegrationType, ModuleResultType } from 'wolfy-module-kit'
import { type FormFieldConfig } from '@/components/ConfigForm/ConfigForm'

export const FORM_FIELDS: FormFieldConfig[] = [
  {
    key: "resultAction",
    label: "Module Result Action",
    type: "select",
    options: [AppActionsSchema.enum.Done, AppActionsSchema.enum.CustomAction],
    required: true,
  },
  {
    key: 'replayAbility',
    label: 'Replay Ability',
    type: 'select',
    options: Object.values(ModuleReplayAbility) as string[],
    required: true,
  },
  {
    key: 'expectedResultType',
    label: 'Expected Result Type',
    type: 'select',
    options: Object.values(ModuleResultType) as string[],
    required: true,
  },
  {
    key: 'integrationType',
    label: 'Integration Type',
    type: 'select',
    options: Object.values(ModuleIntegrationType) as string[],
    required: true,
  },
]