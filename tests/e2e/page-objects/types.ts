export type BlockMetrics = {
  className: string;
  gripHeight: number;
  height: number;
  overflow: boolean;
  text: string;
};

export type LocalProviderConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
};
