export type BlockMetrics = {
  className: string;
  gripHeight: number;
  height: number;
  left: number;
  overflow: boolean;
  text: string;
  top: number;
  width: number;
};

export type LocalProviderConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
};
