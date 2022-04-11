export interface Download {
  name: string;
  status: "failed" | "complete" | "pending";
  reason?: string;
  size?: number;
}
export interface State {
  enabled: boolean;
  proxyUrl: string;
  azureSasUrl: string;
  proxyBaseUrl: string;
  downloads: { [key: string]: Download };
}
