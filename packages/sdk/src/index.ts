// Placeholder for AgentPay Hub SDK entrypoint.
export class AgentPayClient {
  constructor(private readonly baseUrl: string) {}

  // TODO: implement typed API wrappers.
  async ping(): Promise<string> {
    return `AgentPay SDK placeholder targeting ${this.baseUrl}`;
  }
}
