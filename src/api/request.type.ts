export interface IServerResponse {
  data: [];
  error: null | {
    code: number;
    message: string;
  };
}
