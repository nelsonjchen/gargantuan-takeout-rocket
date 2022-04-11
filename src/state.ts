export interface Download {
  name: string;
  status: "failed" | "complete" | "pending";
  reason?: string;
}
export interface State {
  enabled: boolean;
  proxyUrl: string;
  azureSasUrl: string;
  downloads: { [key: string]: Download };
}
