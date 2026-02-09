// Configuration models

export type ConfigType = 'string' | 'int' | 'bool' | 'json' | 'secret';

export interface ConfigValue {
  readonly key: string;
  readonly value: unknown;
  readonly type: ConfigType;
  readonly created_at: string;
  readonly updated_at: string;
  readonly updated_by: string;
  readonly notes: string;
}
