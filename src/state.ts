export interface Download {
  name: string;
}
export interface State {
  enabled: boolean;
  proxyUrl: string;
  azureSasUrl: string;
  downloads: { [key: string]: Download };
}
